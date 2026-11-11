"""Generate an optimized static entry from the original, unmodified build.

Run: python tools/optimize_site.py
Requires Pillow. Original assets stay available for rollback and old tabs.
"""

import hashlib
import json
from pathlib import Path
import re

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
MAIN = ROOT / 'assets/index-BqtQZCmj.js'
CSS = ROOT / 'assets/index-BXXE7le4.css'
LOSSLESS = ['fish.png', 'spiral.png', 'stone.png', 'prismatic.png', 'WechatIMG524.jpg']
SPINNER = 'loading2.webp'


def replace_once(text, old, new):
    if text.count(old) != 1:
        raise ValueError(f'Expected exactly one original build marker: {old[:80]}')
    return text.replace(old, new, 1)


def main():
    source = MAIN.read_text()
    # This generated public-file map only feeds the eager Image() preload loop.
    # Removing the loop leaves normal img/CSS loading and the catalogue fetch intact.
    start = source.index(',Y$=Object.assign({')
    end = source.index('const q$=b0(', start)
    source = source[:start] + ';' + source[end:]

    modules = sorted(set(re.findall(r'import\("\./([^"/]+\.js)"\)', source)))
    inputs = [Path(__file__), MAIN, CSS, ROOT / 'fonts/the-love-song.ttf']
    inputs += [ROOT / name for name in LOSSLESS + [SPINNER]]
    inputs += [ROOT / 'assets' / name for name in modules]
    digest = hashlib.sha256()
    for path in inputs:
        digest.update(path.read_bytes())
    output = ROOT / 'assets' / ('optimized-' + digest.hexdigest()[:12])
    output.mkdir(exist_ok=True)
    base = '/' + output.relative_to(ROOT).as_posix()
    replacements, sizes = {}, []

    for name in LOSSLESS:
        original = ROOT / name
        target = output / (original.stem + '.webp')
        with Image.open(original) as image:
            # exact=True also preserves RGB values underneath transparent pixels.
            image.save(target, 'WEBP', lossless=True, exact=True, method=6)
            with Image.open(target) as encoded:
                if image.convert('RGBA').tobytes() != encoded.convert('RGBA').tobytes():
                    raise ValueError(f'Lossless pixel verification failed: {name}')
        replacements[name] = base + '/' + target.name
        sizes.append({'source': name, 'before': original.stat().st_size,
                      'after': target.stat().st_size, 'mode': 'lossless'})

    # The spinner renders at 128 CSS pixels. Keep up to 4x pixels for dense screens,
    # rather than decoding a 6002 x 7001 texture (~168 MB before GPU copies).
    with Image.open(ROOT / SPINNER) as image:
        image.thumbnail((512, 512), Image.Resampling.LANCZOS)
        image.save(output / SPINNER, 'WEBP', lossless=True, exact=True, method=6)
        sizes.append({'source': SPINNER, 'before': (ROOT / SPINNER).stat().st_size,
                      'after': (output / SPINNER).stat().st_size,
                      'mode': 'resized spinner', 'dimensions': image.size})
    replacements[SPINNER] = base + '/' + SPINNER

    for name, url in replacements.items():
        # Tailwind selectors must keep their original class names; the spinner
        # URL is changed only inside the corresponding CSS declaration below.
        if name != SPINNER:
            source = source.replace('/' + name, url)
    # The same optimized author image must be used by the HTML preload and the app.
    source = replace_once(source, 'src:"/preview-title.webp",alt:"title"',
                          'src:"/preview-title.webp",alt:"title",fetchPriority:"high",decoding:"async"')
    # Remove inherited whitespace-only lines inside generated CSS templates.
    source = re.sub(r'(?m)^[ \t]+$', '', source)
    (output / 'index.js').write_text(source)

    # ReactPlayer lazily imports these modules, which import exports from the entry.
    # Keep all imports in this versioned directory to avoid loading the old entry
    # and mounting the application a second time on clients with cached modules.
    for name in modules:
        module = (ROOT / 'assets' / name).read_text()
        module = module.replace('./' + MAIN.name, './index.js')
        (output / name).write_text(module)

    stylesheet = CSS.read_text()
    for name, url in replacements.items():
        stylesheet = stylesheet.replace('/' + name, url)
    stylesheet = replace_once(stylesheet,
                              'font-weight:400;font-style:normal}',
                              'font-weight:400;font-style:normal;font-display:swap}')
    (output / 'index.css').write_text(stylesheet)

    (ROOT / 'index.html').write_text(f'''<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>TIE-DYE</title>
    <link rel="preconnect" href="https://kompass.oss-cn-beijing.aliyuncs.com" />
    <link rel="preload" as="image" href="/preview-title.webp" fetchpriority="high" />
    <link rel="preload" as="image" href="{replacements['WechatIMG524.jpg']}" />
    <link rel="preload" as="font" type="font/ttf" href="/fonts/the-love-song.ttf" crossorigin />
    <link rel="stylesheet" crossorigin href="{base}/index.css" />
    <script type="module" crossorigin src="{base}/index.js"></script>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
''')
    (output / 'manifest.json').write_text(json.dumps({
        'entry': base + '/index.js', 'images': sizes,
        'lazy_modules': modules,
        'original_commit': '00c968783e444201bb7bf7f16eeec3044064c2b9'
    }, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'output': str(output), 'images': sizes}, indent=2))


if __name__ == '__main__':
    main()
