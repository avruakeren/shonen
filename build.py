import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from scraper import OtakudesuScraper

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
os.makedirs(DATA_DIR, exist_ok=True)

scraper = OtakudesuScraper()

# Ongoing
print("Scraping ongoing...")
try:
    ongoing = scraper.get_ongoing()
    if ongoing:
        with open(os.path.join(DATA_DIR, 'ongoing.json'), 'w', encoding='utf-8') as f:
            json.dump(ongoing, f, ensure_ascii=False)
        print(f"  Saved {len(ongoing)} items")
    else:
        raise Exception("Empty result")
except Exception as e:
    print(f"  WARNING: ongoing failed - {e}")
    with open(os.path.join(DATA_DIR, 'ongoing.json'), 'w') as f:
        json.dump([], f)

# Schedule
print("Scraping schedule...")
try:
    schedule = scraper.get_schedule()
    if schedule:
        with open(os.path.join(DATA_DIR, 'schedule.json'), 'w', encoding='utf-8') as f:
            json.dump(schedule, f, ensure_ascii=False)
        print(f"  Saved {len(schedule)} days")
    else:
        raise Exception("Empty result")
except Exception as e:
    print(f"  WARNING: schedule failed - {e}")
    with open(os.path.join(DATA_DIR, 'schedule.json'), 'w') as f:
        json.dump([], f)

print("Build data complete")
