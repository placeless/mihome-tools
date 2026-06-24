import json
import unittest
from datetime import datetime, timedelta

from mihome_feeder.cli_stats import summarize_records


class SummarizeRecordsTests(unittest.TestCase):
    def test_week_total_covers_seven_calendar_days(self):
        now = datetime.now().astimezone()
        today = now.replace(hour=1, minute=0, second=0, microsecond=0)
        records = [
            {
                "time": int((today - timedelta(days=days_ago)).timestamp()),
                "value": json.dumps([{"piid": 4, "value": 1}]),
            }
            for days_ago in range(8)
        ]

        summary = summarize_records(records)

        self.assertEqual(summary["feed_week"], 7)


if __name__ == "__main__":
    unittest.main()
