from pipeline.fpa_fod import aggregate


def test_aggregate_yearly_only_pnw_states(tiny_fpa_fod):
    out = aggregate(tiny_fpa_fod, states=("WA", "OR", "ID", "MT", "CA"))
    yearly = {y["year"]: y for y in out["yearly"]}
    assert yearly[2010]["fires"] == 3
    assert yearly[2010]["acres"] == 515.0
    assert yearly[2011]["fires"] == 3
    assert yearly[2011]["acres"] == 99021.0


def test_aggregate_by_cause_sorted_desc(tiny_fpa_fod):
    out = aggregate(tiny_fpa_fod, states=("WA", "OR", "ID", "MT", "CA"))
    causes = out["by_cause"]
    assert causes[0]["cause"] == "Lightning"
    assert causes[0]["fires"] == 3
    assert causes[-1]["fires"] <= causes[0]["fires"]


def test_aggregate_by_state(tiny_fpa_fod):
    out = aggregate(tiny_fpa_fod, states=("WA", "OR", "ID", "MT", "CA"))
    by_state = {s["state"]: s for s in out["by_state"]}
    assert by_state["OR"]["fires"] == 3
    assert by_state["WA"]["fires"] == 1
    assert "TX" not in by_state  # filter applied
