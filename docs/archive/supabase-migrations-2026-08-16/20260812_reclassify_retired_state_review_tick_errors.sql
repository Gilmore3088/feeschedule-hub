-- Reclassify obsolete state-agent review-tick failures.
--
-- State agents are full collection pipelines now, not AgentBase.review()
-- workers. The Aug 12 scheduler cleanup stopped future state review ticks, but
-- already-dispatched rows still appeared as operational failures for 24 hours.
-- Preserve the old message in output_payload while removing it from active
-- failure counts.

UPDATE agent_events
   SET status = 'success',
       output_payload = jsonb_strip_nulls(jsonb_build_object(
           'skipped', TRUE,
           'reason', 'State collection moved to Atlas/Magellan coordination',
           'previous_status', status,
           'previous_error', COALESCE(
               error->>'message',
               error->>'error',
               output_payload->>'error',
               output_payload->>'message'
           )
       )),
       error = NULL
 WHERE action = 'review_tick'
   AND status = 'error'
   AND LEFT(agent_name, 6) = 'state_'
   AND COALESCE(
       error->>'message',
       error->>'error',
       output_payload->>'error',
       output_payload->>'message'
   ) = 'no agent class registered for ' || agent_name;
