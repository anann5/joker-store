import sys
from agent_workflow.workflow import WriterReviewerWorkflow

def main(argv):
    if len(argv) < 2:
        print('Usage: python -m agent_workflow.main "Your prompt here"')
        return 1

    user_request = argv[1]
    wf = WriterReviewerWorkflow()
    result = wf.run(user_request)
    print(result)
    return 0

if __name__ == '__main__':
    sys.exit(main(sys.argv))
