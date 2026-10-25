"""手で生成した画像をプロジェクトに取り込む。設定はプロジェクト直下の .claude/image-gen-inbox.json。

  prompts [id ...]  生成用のプロンプトを出す（省略時は出力先に画像がそろっていない項目すべて）
  ingest            inbox の画像の背景を抜き、<inbox>/review/ に加工済みの画像と確認用の一覧を作る
  adopt id ...      確認済みの項目を出力先へ移し、afterAdopt のコマンドを呼ぶ
"""
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

from PIL import Image

CONFIG_PATH = Path('.claude/image-gen-inbox.json')
DEFAULTS = {
    'inbox': 'art-inbox',
    'variants': [],
    'styleReference': None,
    'background': '#ff00ff',
    'backgroundTolerance': 100,
    'keepLargestShape': True,
    'binaryAlpha': True,
    'outputWidth': None,
    'previewCells': 40,
    'afterAdopt': None,
}
IMAGE_SUFFIXES = ('.png', '.jpg', '.jpeg', '.webp')
PREVIEW_SCALE = 4
STYLE_HINT = 'Match the art style of the attached image. '


def find_root():
    for path in (Path.cwd(), *Path.cwd().parents):
        if (path / CONFIG_PATH).exists():
            return path
    sys.exit(f'{CONFIG_PATH} が見つかりません。プロジェクト直下に作ってください')


def load_config(root):
    config = {**DEFAULTS, **json.loads((root / CONFIG_PATH).read_text(encoding='utf-8'))}
    missing = [k for k in ('outputDir', 'itemsCommand') if k not in config]
    if missing:
        sys.exit(f'{CONFIG_PATH} に {missing} がありません')
    return config


def file_stem(item_id, variant):
    return f'{item_id}-{variant}' if variant else item_id


def variants_of(config):
    return config['variants'] or ['']


def load_items(root, config):
    # 項目の一覧とプロンプトはプロジェクトごとに作り方が違うため、プロジェクト側のコマンドに出させる。
    output = subprocess.run(config['itemsCommand'], cwd=root, check=True, capture_output=True, text=True).stdout
    return {item['id']: item for item in json.loads(output)}


def print_prompts(root, config, ids):
    items = load_items(root, config)
    output_dir = root / config['outputDir']
    variants = variants_of(config)
    targets = ids or [i for i in items if not all((output_dir / f'{file_stem(i, v)}.png').exists() for v in variants)]
    unknown = [i for i in targets if i not in items]
    if unknown:
        sys.exit(f'itemsCommand の一覧に無い項目: {unknown}')
    for item_id in targets:
        item = items[item_id]
        print(f'## {item.get("label", item_id)}（{item_id}）')
        for index, variant in enumerate(variants):
            # 1枚目は共通の見本、2枚目からはその項目の1枚目を添えて画風をそろえる。
            reference = config['styleReference'] if index == 0 else f'{file_stem(item_id, variants[0])} の生成画像'
            prompt = item['prompts'][variant] if variant else item['prompt']
            print(f'\n### {file_stem(item_id, variant)}.png で保存' + (f'（{reference} を添付）' if reference else '') + '\n')
            print((STYLE_HINT if reference else '') + prompt)
        print()


def parse_hex(color):
    return tuple(int(color[i:i + 2], 16) for i in (1, 3, 5))


def largest_component(mask, width, height):
    label = [0] * len(mask)
    best, best_size, current = 0, 0, 0
    for start in range(len(mask)):
        if not mask[start] or label[start]:
            continue
        current += 1
        label[start] = current
        stack, size = [start], 0
        while stack:
            i = stack.pop()
            size += 1
            x, y = i % width, i // width
            for j in ((i - 1) if x > 0 else -1, (i + 1) if x < width - 1 else -1, (i - width) if y > 0 else -1, (i + width) if y < height - 1 else -1):
                if j >= 0 and mask[j] and not label[j]:
                    label[j] = current
                    stack.append(j)
        if size > best_size:
            best, best_size = current, size
    return [l == best for l in label]


def cut_out(image, config):
    image = image.convert('RGBA')
    width, height = image.size
    pixels = list(image.getdata())
    key, tolerance = parse_hex(config['background']), config['backgroundTolerance'] ** 2
    keep = [sum((c - k) ** 2 for c, k in zip(p[:3], key)) > tolerance for p in pixels]
    if config['keepLargestShape']:
        # Gemini アプリなどは隅に透かしを入れるため、いちばん大きい塊だけを残す。
        keep = largest_component(keep, width, height)
    image.putdata([p if k else (0, 0, 0, 0) for p, k in zip(pixels, keep)])
    image = image.crop(image.getbbox())
    if config['outputWidth']:
        size = (config['outputWidth'], round(image.height * config['outputWidth'] / image.width))
        image = image.convert('RGBa').resize(size, Image.LANCZOS).convert('RGBA')
    if config['binaryAlpha']:
        image.putdata([(r, g, b, 255) if a >= 128 else (0, 0, 0, 0) for r, g, b, a in image.getdata()])
    return image


def preview(image, cells):
    small = image.resize((cells, max(1, round(image.height * cells / image.width))), Image.NEAREST)
    return small.resize((small.width * PREVIEW_SCALE, small.height * PREVIEW_SCALE), Image.NEAREST)


def stem_pattern(config):
    variants = '|'.join(re.escape(v) for v in config['variants'])
    return re.compile(rf'^(?P<id>.+)-(?P<variant>{variants})$' if variants else r'^(?P<id>.+)$')


def ingest(root, config):
    inbox, pattern = root / config['inbox'], stem_pattern(config)
    review = inbox / 'review'
    sources = sorted(p for p in inbox.iterdir() if p.suffix.lower() in IMAGE_SUFFIXES) if inbox.exists() else []
    if not sources:
        sys.exit(f'{config["inbox"]}/ に画像がありません')
    misnamed = [p.name for p in sources if not pattern.match(p.stem)]
    if misnamed:
        sys.exit(f'<id>{"-<" + "|".join(config["variants"]) + ">" if config["variants"] else ""} の名前になっていない画像: {misnamed}')
    review.mkdir(parents=True, exist_ok=True)
    rows = {}
    for path in sources:
        out = cut_out(Image.open(path), config)
        out.save(review / f'{path.stem}.png')
        match = pattern.match(path.stem)
        rows.setdefault(match['id'], {})[match.groupdict().get('variant') or ''] = out
        print(f'{path.name} → {config["inbox"]}/review/{path.stem}.png ({out.width}x{out.height})')
    write_contact_sheet(rows, variants_of(config), config['previewCells'], review / 'contact-sheet.png')


def write_contact_sheet(rows, variants, cells, path):
    # 上段に加工済みの画像、下段に previewCells の粗さへ点で落とした見本を並べる。
    cell, gap = 240, 8
    sheet = Image.new('RGBA', (gap + len(variants) * (cell + gap), gap + len(rows) * (2 * cell + gap)), (200, 200, 200, 255))
    for row, (item_id, images) in enumerate(sorted(rows.items())):
        for col, variant in enumerate(variants):
            if variant not in images:
                continue
            x, y = gap + col * (cell + gap), gap + row * (2 * cell + gap)
            for k, img in enumerate((images[variant], preview(images[variant], cells))):
                img = img.copy()
                img.thumbnail((cell, cell), Image.NEAREST)
                sheet.alpha_composite(img, (x + (cell - img.width) // 2, y + k * cell + (cell - img.height) // 2))
    sheet.save(path)
    print(f'確認用の一覧: {path}（行は {", ".join(sorted(rows))}、列は {", ".join(variants) or "1枚"}）')


def adopt(root, config, ids):
    inbox, output_dir = root / config['inbox'], root / config['outputDir']
    review = inbox / 'review'
    variants = variants_of(config)
    incomplete = [i for i in ids if not all((review / f'{file_stem(i, v)}.png').exists() for v in variants)]
    if incomplete:
        sys.exit(f'review/ にそろっていない項目: {incomplete}（先に ingest を実行）')
    output_dir.mkdir(parents=True, exist_ok=True)
    for item_id in ids:
        for variant in variants:
            stem = file_stem(item_id, variant)
            (review / f'{stem}.png').replace(output_dir / f'{stem}.png')
            for raw in inbox.iterdir():
                if raw.stem == stem and raw.suffix.lower() in IMAGE_SUFFIXES:
                    raw.unlink()
    if config['afterAdopt']:
        subprocess.run([*config['afterAdopt'], *ids], cwd=root, check=True)
    print(f'取り込んだ項目: {", ".join(ids)}')


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest='command', required=True)
    commands.add_parser('prompts').add_argument('ids', nargs='*')
    commands.add_parser('ingest')
    commands.add_parser('adopt').add_argument('ids', nargs='+')
    args = parser.parse_args()
    root = find_root()
    config = load_config(root)
    if args.command == 'prompts':
        print_prompts(root, config, args.ids)
    elif args.command == 'ingest':
        ingest(root, config)
    else:
        adopt(root, config, args.ids)


if __name__ == '__main__':
    main()
