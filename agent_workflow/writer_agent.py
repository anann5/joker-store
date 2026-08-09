class WriterAgent:
    """Simple Writer agent that creates and revises content."""

    def create_initial_content(self, user_request: str) -> str:
        # Very simple templated 'generation' to simulate LLM output
        content = f"Draft: {user_request.strip()}\n\nThis is a first-pass paragraph addressing the request."
        return content

    def revise(self, content: str, feedback: str) -> str:
        # Apply feedback in a naive way: append reviewer's suggestions
        revised = content + "\n\n[Revised based on reviewer feedback]: " + feedback
        # Make a small polish: replace 'first-pass' with 'refined'
        revised = revised.replace('first-pass', 'refined')
        return revised
