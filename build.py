import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from scraper import OtakudesuScraper

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
os.makedirs(DATA_DIR, exist_ok=True)

scraper = OtakudesuScraper()

def safe_write(filename, data):
    path = os.path.join(DATA_DIR, filename)
    try:
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False)
        print(f"  Saved {len(data)} items" if isinstance(data, list) else f"  Saved data")
    except Exception as e:
        print(f"  WARNING: failed to write {filename}: {e}")

# Ongoing
print("Scraping ongoing...")
try:
    ongoing = scraper.get_ongoing()
    if ongoing:
        safe_write('ongoing.json', ongoing)
    else:
        print("  WARNING: Empty result, keeping existing cache if any")
except Exception as e:
    print(f"  WARNING: ongoing failed - {e}, keeping existing cache")

# Schedule
print("Scraping schedule...")
try:
    schedule = scraper.get_schedule()
    if schedule:
        safe_write('schedule.json', schedule)
    else:
        print("  WARNING: Empty result, keeping existing cache if any")
except Exception as e:
    print(f"  WARNING: schedule failed - {e}, keeping existing cache")

print("Build data complete")
