# Project Overview

**Who-You-Gonna-Call** is a Ghost on-call scheduler that generates optimized on-call schedules using a smart round-robin algorithm.

## Purpose

- Creates fair and balanced on-call schedules for Ghost engineering teams
- Balances fairness, workload distribution, and operational constraints
- Supports three rotation types (AM, Core, PM) with different time slots and engineer pools
- Generates schedules for 14-day lookahead periods (weekdays only)

## Rotation Types

- **AM**: 9:00-12:00 (3 hours)
- **Core**: 12:00-18:00 (6 hours)
- **PM**: 18:00-21:00 (3 hours)

## Key Features

- Smart round-robin algorithm with workload balancing
- Historical data integration for long-term fairness
- SQLite database with WAL mode for concurrent access
- Slack integration for notifications and canvas updates
- Pod-based engineer organization (Blinky, Swayze, Zero)
- Type-safe TypeScript implementation with ES modules
