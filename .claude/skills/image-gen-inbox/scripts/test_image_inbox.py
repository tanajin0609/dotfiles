import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from PIL import Image

import image_inbox

CONFIG = {**image_inbox.DEFAULTS, 'outputWidth': 100}


class CutOutTest(unittest.TestCase):
    def test_keeps_only_the_largest_shape_and_drops_background(self):
        image = Image.new('RGB', (200, 100), (255, 0, 255))
        image.paste((40, 120, 60), (20, 30, 120, 70))
        image.paste((230, 120, 150), (40, 45, 100, 55))
        image.paste((255, 255, 255), (190, 90, 195, 95))
        out = image_inbox.cut_out(image, CONFIG)
        self.assertEqual(out.size, (100, 40))
        self.assertEqual({a for *_, a in out.getdata()}, {255})
        self.assertIn((230, 120, 150, 255), out.getdata())


class PipelineTest(unittest.TestCase):
    def test_ingest_then_adopt_moves_images_and_calls_after_adopt(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            config = {**CONFIG, 'outputDir': 'out', 'itemsCommand': ['true'], 'variants': ['a', 'b'], 'afterAdopt': ['touch']}
            (root / 'art-inbox').mkdir()
            for variant in ('a', 'b'):
                image = Image.new('RGB', (50, 50), (255, 0, 255))
                image.paste((0, 0, 0), (10, 10, 40, 30))
                image.save(root / f'art-inbox/my-item-{variant}.jpg')
            with mock.patch('builtins.print'):
                image_inbox.ingest(root, config)
                image_inbox.adopt(root, config, ['my-item'])
            self.assertTrue((root / 'out/my-item-a.png').exists() and (root / 'out/my-item-b.png').exists())
            self.assertTrue((root / 'my-item').exists())
            self.assertFalse(list((root / 'art-inbox').glob('my-item-*')))

    def test_prompts_lists_items_without_images_and_adds_style_hint_from_second(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            items = [{'id': 'x', 'prompts': {'a': 'P1', 'b': 'P2'}}]
            config = {**CONFIG, 'outputDir': 'out', 'variants': ['a', 'b'], 'itemsCommand': ['echo', json.dumps(items)]}
            with mock.patch('builtins.print') as printed:
                image_inbox.print_prompts(root, config, [])
            lines = [c.args[0] for c in printed.call_args_list if c.args]
            self.assertIn('P1', lines)
            self.assertIn(image_inbox.STYLE_HINT + 'P2', lines)


if __name__ == '__main__':
    unittest.main()
