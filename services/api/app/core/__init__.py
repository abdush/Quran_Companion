"""Cross-cutting infrastructure shared by every bounded context.

Deliberately thin: settings, database access, cache, and problem responses. No
domain logic lives here, and contexts never import each other through it.
"""
