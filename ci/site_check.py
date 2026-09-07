"""Check and stage tracked public-site assets, without external requests."""
import argparse
import html.parser
import shutil
import subprocess
from pathlib import Path
from urllib.parse import unquote, urlsplit

EXTENSIONS = {'.html', '.css', '.js', '.mjs', '.json', '.webmanifest', '.svg',
              '.png', '.jpg', '.jpeg', '.webp', '.gif', '.ico', '.mp4', '.webm',
              '.mp3', '.wav', '.ogg', '.woff', '.woff2', '.ttf', '.xml', '.txt'}


class References(html.parser.HTMLParser):
    def __init__(self):
        super().__init__()
        self.refs = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if attrs.get('src'):
            self.refs.append(attrs['src'])
        if tag == 'link' and attrs.get('href'):
            self.refs.append(attrs['href'])
        if tag == 'a' and attrs.get('href', '').split('?')[0].endswith('.html'):
            self.refs.append(attrs['href'])
        if attrs.get('poster'):
            self.refs.append(attrs['poster'])


def check(root, files, repo):
    errors = []
    for name in files:
        path = root / name
        if path.is_symlink():
            errors.append(f'{name}: symlinks cannot be published')
        if path.suffix == '.html':
            parser = References()
            parser.feed(path.read_text(encoding='utf-8-sig'))
            for ref in parser.refs:
                url = urlsplit(ref)
                if url.scheme or url.netloc or not url.path or '{{' in url.path:
                    continue
                target = unquote(url.path)
                if target.startswith('/'):
                    target = target.lstrip('/')
                    if target.startswith(repo + '/'):
                        target = target[len(repo) + 1:]
                    candidate = root / target
                else:
                    candidate = path.parent / target
                candidate = candidate.resolve()
                if not candidate.is_relative_to(root):
                    errors.append(f'{name}: reference escapes site: {ref}')
                    continue
                if candidate.is_dir():
                    candidate /= 'index.html'
                if candidate.relative_to(root).as_posix() not in files:
                    errors.append(f'{name}: missing published asset: {ref}')
        if path.suffix in {'.js', '.mjs'}:
            result = subprocess.run(['node', '--check', '--input-type=module'],
                                    input=path.read_bytes(), capture_output=True)
            if result.returncode:
                errors.append(f'{name}: {result.stderr.decode(errors="replace")}')
    if errors:
        raise ValueError('\n'.join(errors))


def main():
    args = argparse.ArgumentParser()
    args.add_argument('--repo', required=True)
    args.add_argument('--output', default='_site')
    opt = args.parse_args()
    root = Path.cwd().resolve()
    tracked = subprocess.check_output(['git', 'ls-files', '-z']).decode('utf-8').split('\0')
    files = {n for n in tracked if n and not any(p.startswith('.') for p in Path(n).parts)
             and (Path(n).suffix.lower() in EXTENSIONS) and not n.startswith('scripts/')}
    if 'index.html' not in files:
        raise ValueError('Missing index.html')
    check(root, files, opt.repo)
    dest = root / opt.output
    # Refuse an existing destination: never erase source files or unrelated output.
    dest.mkdir(exist_ok=False)
    for name in sorted(files):
        out = dest / name
        out.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(root / name, out)
    (dest / '.nojekyll').touch()
    print(f'Validated and staged {len(files)} public assets')


if __name__ == '__main__':
    main()
