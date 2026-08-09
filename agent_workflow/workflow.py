from .writer_agent import WriterAgent
from .reviewer_agent import ReviewerAgent

class WriterReviewerWorkflow:
    def __init__(self):
        self.writer = WriterAgent()
        self.reviewer = ReviewerAgent()

    def run(self, user_request: str) -> str:
        # Step 1: writer creates initial content
        draft = self.writer.create_initial_content(user_request)

        # Step 2: reviewer reviews and returns concise feedback
        feedback = self.reviewer.review(draft)

        # Step 3: writer revises based on feedback
        refined = self.writer.revise(draft, feedback)

        # Final output: refined content
        final_output = f"-- Writer initial draft --\n{draft}\n\n-- Reviewer feedback --\n{feedback}\n\n-- Final refined content --\n{refined}"
        return final_output
