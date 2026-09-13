def grade_sheet(sections, answers, negative_marking):
    offset = 0
    rows = []
    questions = []
    for section in sections:
        correct = wrong = unanswered = 0
        for key in section["correct_answers"]:
            answer = answers[offset]
            status = "unanswered" if answer is None else "correct" if answer == key else "wrong"
            correct += status == "correct"
            wrong += status == "wrong"
            unanswered += status == "unanswered"
            questions.append({"number": offset + 1, "subject": section["title"], "answer": answer, "correct_answer": key, "status": status})
            offset += 1
        count = len(section["correct_answers"])
        rows.append({"title": section["title"], "total": count, "correct": correct, "wrong": wrong, "unanswered": unanswered,
            "percentage": round(100 * (correct - wrong / 3 if negative_marking else correct) / count, 2),
            "accuracy": round(100 * correct / (correct + wrong), 2) if correct + wrong else 0})
    total = len(answers)
    correct = sum(row["correct"] for row in rows)
    wrong = sum(row["wrong"] for row in rows)
    return {"sections": rows, "questions": questions, "total": total, "correct": correct, "wrong": wrong,
        "unanswered": total - correct - wrong,
        "percentage": round(100 * (correct - wrong / 3 if negative_marking else correct) / total, 2),
        "accuracy": round(100 * correct / (correct + wrong), 2) if correct + wrong else 0,
        "negative_marking": negative_marking}
