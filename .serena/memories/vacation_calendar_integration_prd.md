# Vacation Calendar Integration PRD Summary

## Key Requirements:

- Integrate existing Google Calendar for OOO events
- Event format: "<first name> OOO" (single or multi-day)
- Check engineer availability during schedule generation
- Skip unavailable engineers, proceed to next in rotation
- Use real-time API calls (no caching/pre-computation)
- Service account authentication
- Daily updates are sufficient
- Log errors if calendar unavailable but continue scheduling
- Only consider future OOO events

## Technical Approach:

- Modify generateScheduleUsingSmartRoundRobin() to check OOO status
- Parse event titles to extract first name, use creator email as fallback
- Any OOO event on a day makes engineer unavailable for all rotations
- Generate alerts for manual resolution when schedule conflicts arise
