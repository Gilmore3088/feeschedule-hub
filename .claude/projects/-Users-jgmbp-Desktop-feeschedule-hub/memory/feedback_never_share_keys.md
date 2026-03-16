---
name: feedback_never_share_keys
description: User accidentally shared API keys in chat - need to warn immediately and never display key values
type: feedback
---

User accidentally exposed ANTHROPIC_API_KEY and FRED_API_KEY in conversation by sharing .env.local contents.

**Why:** API keys in conversation history are a security risk - they're visible to anyone with access to the conversation.

**How to apply:** When reading .env files that contain actual key values, ALWAYS mask them (show only first 4 chars + "..."). Never display full key values. If the system shows key values in context reminders, immediately warn the user to rotate.
