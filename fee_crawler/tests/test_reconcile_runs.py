from unittest.mock import MagicMock

from fee_crawler.commands.reconcile_runs import run


def test_reconcile_runs_terminalizes_each_execution_surface():
    db = MagicMock()
    cursors = []
    for count in (2, 1, 3, 4, 5, 1):
        cursor = MagicMock()
        cursor.rowcount = count
        cursors.append(cursor)
    db.execute.side_effect = cursors

    result = run(db)

    assert result == {
        "ops_jobs": 2,
        "linked_pipeline_runs": 1,
        "pipeline_runs": 3,
        "crawl_runs": 4,
        "report_jobs": 5,
        "atlas_health_marker": 1,
    }
    assert db.execute.call_count == 6
    assert "heartbeat_at" in db.execute.call_args_list[0].args[0]
    assert "pipeline.ops_job_id" in db.execute.call_args_list[1].args[0]
    assert "heartbeat_at" in db.execute.call_args_list[3].args[0]
    assert "INTERVAL '15 minutes'" in db.execute.call_args_list[3].args[0]
    assert "latest_atlas" in db.execute.call_args_list[5].args[0]
    db.commit.assert_called_once_with()
