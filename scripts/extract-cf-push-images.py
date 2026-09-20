"""Extract original diagrams without modifying or republishing the complete PDF."""
import sys
from pathlib import Path
from pypdf import PdfReader

root = Path(__file__).resolve().parents[1]
target = root / 'web/public/portfolio/cf-push'
target.mkdir(parents=True, exist_ok=True)
reader = PdfReader(sys.argv[1])
for page_number in range(3, 10):
    for index, image in enumerate(reader.pages[page_number - 1].images, 1):
        image.image.save(target / f'page-{page_number}-{index}.png')
        print(f'page-{page_number}-{index}.png {image.image.size}')
