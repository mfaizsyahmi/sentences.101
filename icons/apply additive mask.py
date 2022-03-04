from PIL import Image, ImageOps
from pathlib import Path
import sys

for arg in sys.argv[1:]:
    file = Path(arg)
    if not file.exists():
        continue
    
    with Image.open(file) as im:
        mask = ImageOps.grayscale(im)
        conv = im.convert("RGB")
        conv.putalpha(mask)
        
        newfile = file.with_name(file.stem + "_trans" + file.suffix)
        conv.save(newfile)
    