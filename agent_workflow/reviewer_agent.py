class ReviewerAgent:
    """Simple Reviewer agent that provides concise actionable feedback."""

    def review(self, content: str) -> str:
        # Very naive review: suggest clarifications and a tone improvement
        suggestions = []
        if len(content) < 100:
            suggestions.append('Expand the paragraph with an additional example to increase clarity.')
        suggestions.append('Use active voice and avoid passive constructions.')
        suggestions.append('Mention one concrete benefit with a short example.')

        return ' '.join(suggestions)
