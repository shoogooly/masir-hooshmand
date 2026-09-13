import pytest
from pydantic import ValidationError
from app.schemas import PlanCreate


def test_three_line_activity_is_preserved_and_four_lines_rejected():
    title = "مطالعه ریاضی\nحل تمرین\nتحلیل پاسخ‌ها"
    data = dict(student_id="student", title="برنامه هفتگی", week_label="هفته اول", days=[{"label":"شنبه"}], day_start_time="00:00", day_end_time="24:00", activities=[{"day":"شنبه", "title":title, "start_time":"00:00", "end_time":"24:00"}])
    assert PlanCreate(**data).activities[0]["title"] == title
    data["activities"][0]["title"] += "\nخط چهارم"
    with pytest.raises(ValidationError):
        PlanCreate(**data)
