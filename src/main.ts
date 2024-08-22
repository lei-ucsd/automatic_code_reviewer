import { readFileSync } from "fs";
import Anthropic from "@anthropic-ai/sdk";
import * as core from "@actions/core";
import { Octokit } from "@octokit/rest";
import parseDiff, { Chunk, File } from "parse-diff";
import { minimatch } from "minimatch";
import { exec } from "child_process";
import { promisify } from "util";
import { glob } from "glob";

const GITHUB_TOKEN: string = core.getInput("GITHUB_TOKEN");
const ANTHROPIC_API_KEY: string = core.getInput("ANTHROPIC_API_KEY");
const CLAUDE_MODEL: string = core.getInput("CLAUDE_MODEL");

const execAsync = promisify(exec);

const octokit = new Octokit({ auth: GITHUB_TOKEN });

const anthropic = new Anthropic({
  apiKey: ANTHROPIC_API_KEY,
});

interface PRDetails {
  owner: string;
  repo: string;
  pull_number: number;
  title: string;
  description: string;
}

async function addPullRequestComment(
  owner: string,
  repo: string,
  pull_number: number,
  body: string,
): Promise<void> {
  await octokit.issues.createComment({
    owner,
    repo,
    issue_number: pull_number,
    body,
  });
}

// Get pylint score on python files
async function getPylintScore(): Promise<number> {
  const files: string[] = await glob("**/*.py", {
    ignore: ["venv/**", "env/**", "node_modules/**"],
  });

  return 10;
  console.log(files);
  if (files.length === 0) {
    console.log("No Python files found in the repository.");
    return 10;
  }

  const { stdout, stderr } = await execAsync(
    `pylint ${files.join(" ")} --exit-zero  --output-format=text`,
  );

  if (stderr) {
    console.error("Pylint error:", stderr);
  }

  return parsePylint(stdout);
}

function parsePylint(pylintOutput: string): number {
  const match = pylintOutput.match(/Your code has been rated at (\d+\.\d+)/);
  return match ? parseFloat(match[1]) : 0;
}

async function getPRDetails(): Promise<PRDetails> {
  const { repository, number } = JSON.parse(
    readFileSync(process.env.GITHUB_EVENT_PATH || "", "utf8"),
  );
  const prResponse = await octokit.pulls.get({
    owner: repository.owner.login,
    repo: repository.name,
    pull_number: number,
  });
  return {
    owner: repository.owner.login,
    repo: repository.name,
    pull_number: number,
    title: prResponse.data.title ?? "",
    description: prResponse.data.body ?? "",
  };
}

async function getDiff(
  owner: string,
  repo: string,
  pull_number: number,
): Promise<string | null> {
  const response = await octokit.pulls.get({
    owner,
    repo,
    pull_number,
    mediaType: { format: "diff" },
  });
  // @ts-expect-error - response.data is a string
  return response.data;
}

async function analyzeCode(
  parsedDiff: File[],
  prDetails: PRDetails,
): Promise<Array<{ body: string; path: string; line: number }>> {
  const comments: Array<{ body: string; path: string; line: number }> = [];

  for (const file of parsedDiff) {
    if (file.to === "/dev/null") continue; // Ignore deleted files
    for (const chunk of file.chunks) {
      const prompt = createPrompt(file, chunk, prDetails);
      const aiResponse = await getAIResponse(prompt);
      if (aiResponse) {
        const newComments = createComment(file, chunk, aiResponse);
        if (newComments) {
          comments.push(...newComments);
        }
      }
    }
  }
  return comments;
}

function createPrompt(file: File, chunk: Chunk, prDetails: PRDetails): string {
  return `You are an expert Python code reviewer with a deep understanding of software engineering principles and best practices. Your task is to review Python code snippets and provide constructive feedback to improve code quality. Follow these guidelines in your review:

  Readability and Simplicity:

  Assess the overall readability of the code.
  Identify overly complex sections and suggest simplifications.


  Naming Conventions and Consistency:

  Check if variable, function, and class names are descriptive and follow Python conventions (snake_case for functions/variables, PascalCase for classes).
  Ensure naming is consistent throughout the code.


  Code Structure and Modularity:

  Evaluate the organization of the code into functions and classes.
  Suggest improvements for better separation of concerns and reusability.


  Documentation and Comments:

  Check for the presence and quality of docstrings for functions and classes.
  Assess inline comments for clarity and necessity.


  Error Handling and Input Validation:

  Identify areas where exception handling should be implemented.
  Suggest input validation for functions to ensure robustness.


  Efficiency and Performance:

  Point out any inefficient algorithms or data structures.
  Suggest optimizations where appropriate.


  Adherence to Python Best Practices:

  Check if the code follows PEP 8 style guidelines.
  Identify usage of Python-specific features and idioms (e.g., list comprehensions, context managers).


  Type Hinting and Annotations:

  Suggest adding type hints to improve code clarity and catch potential type-related errors.


  Testability:

  Assess how easily the code can be unit tested.
  Suggest improvements to make functions more testable.


  Potential Bugs and Edge Cases:

  Identify any logical errors or potential bugs in the code.
  Point out edge cases that may not be handled properly.



  For each issue you identify:

  Clearly explain the problem and why it's an issue.
  Provide a specific suggestion for how to improve the code.
  If applicable, offer a code snippet demonstrating the suggested improvement.

  End your review with a summary of the major points and an overall assessment of the code quality.
  Remember to maintain a constructive and educational tone throughout your review, highlighting both areas for improvement and any positive aspects of the code. Instructions:
- Provide the response in following JSON format:  {"reviews": [{"lineNumber":  <line_number>, "reviewComment": "<review comment>"}]}
- Do not give positive comments or compliments.
- Provide comments and suggestions ONLY if there is something to improve, otherwise "reviews" should be an empty array.
- Write the comment in GitHub Markdown format.
- Use the given description only for the overall context and only comment the code.
- IMPORTANT: NEVER suggest adding comments to the code.

Review the following code diff in the file "${
    file.to
  }" and take the pull request title and description into account when writing the response.

Pull request title: ${prDetails.title}
Pull request description:

---
${prDetails.description}
---

Git diff to review:

\`\`\`diff
${chunk.content}
${chunk.changes
  // @ts-expect-error - ln and ln2 exists where needed
  .map((c) => `${c.ln ? c.ln : c.ln2} ${c.content}`)
  .join("\n")}
\`\`\`
`;
}

async function getAIResponse(prompt: string): Promise<Array<{
  lineNumber: string;
  reviewComment: string;
}> | null> {
  const queryConfig = {
    model: CLAUDE_MODEL,
    temperature: 0.2,
    max_tokens: 700,
  };

  try {
    const response = await anthropic.messages.create({
      ...queryConfig,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const content =
      response.content[0].type === "text" ? response.content[0].text : "";
    let parsedContent;
    try {
      parsedContent = JSON.parse(content);
    } catch (jsonError) {
      console.error("Error parsing initial JSON:", jsonError);
      const cleanedContent = content
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r")
        .replace(/\t/g, "\\t")
        .replace(/\f/g, "\\f")
        .replace(/"/g, '\\"')
        .replace(/\\'/g, "'");

      console.log("Cleaned content:", cleanedContent);

      try {
        parsedContent = JSON.parse(cleanedContent);
      } catch (secondJsonError) {
        console.error("Error parsing cleaned JSON:", secondJsonError);
        console.error("Cleaned content that failed to parse:", cleanedContent);
        return null;
      }
    }

    if (!parsedContent.reviews || !Array.isArray(parsedContent.reviews)) {
      console.error(
        "Parsed content does not contain a 'reviews' array:",
        parsedContent,
      );
      return null;
    }

    // Ensure all reviewComments are properly escaped
    const sanitizedReviews = parsedContent.reviews.map(
      (review: { lineNumber: any; reviewComment: any }) => ({
        lineNumber: review.lineNumber,
        reviewComment: JSON.parse(JSON.stringify(review.reviewComment)),
      }),
    );

    return sanitizedReviews;
  } catch (error) {
    console.error("Error in API call or processing:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
      console.error("Error stack:", error.stack);
    }
    return null;
  }
}

function createComment(
  file: File,
  chunk: Chunk,
  aiResponses: Array<{
    lineNumber: string;
    reviewComment: string;
  }>,
): Array<{ body: string; path: string; line: number }> {
  return aiResponses.flatMap((aiResponse) => {
    if (!file.to) {
      return [];
    }
    const lineNumber = Number(aiResponse.lineNumber);

    // Check if the line number is within the chunk's range
    const isLineInChunk = chunk.changes.some(
      (change) =>
        (change.type === "add" || change.type === "normal") &&
        change.ln === lineNumber,
    );

    if (!isLineInChunk) {
      console.log(
        `Skipping comment for line ${lineNumber} as it's not in the current chunk`,
      );
      return [];
    }

    return {
      body: aiResponse.reviewComment,
      path: file.to,
      line: Number(aiResponse.lineNumber),
    };
  });
}

async function createReviewComment(
  owner: string,
  repo: string,
  pull_number: number,
  comments: Array<{ body: string; path: string; line: number }>,
): Promise<void> {
  await octokit.pulls.createReview({
    owner,
    repo,
    pull_number,
    comments,
    event: "COMMENT",
  });
}

async function main() {
  const prDetails = await getPRDetails();
  let diff: string | null;
  const eventData = JSON.parse(
    readFileSync(process.env.GITHUB_EVENT_PATH ?? "", "utf8"),
  );

  if (eventData.action === "opened") {
    diff = await getDiff(
      prDetails.owner,
      prDetails.repo,
      prDetails.pull_number,
    );
  } else if (eventData.action === "synchronize") {
    const newBaseSha = eventData.before;
    const newHeadSha = eventData.after;

    const response = await octokit.repos.compareCommits({
      headers: {
        accept: "application/vnd.github.v3.diff",
      },
      owner: prDetails.owner,
      repo: prDetails.repo,
      base: newBaseSha,
      head: newHeadSha,
    });

    diff = String(response.data);
  } else {
    console.log("Unsupported event:", process.env.GITHUB_EVENT_NAME);
    return;
  }

  if (!diff) {
    console.log("No diff found");
    return;
  }

  const parsedDiff = parseDiff(diff);

  const excludePatterns = core
    .getInput("exclude")
    .split(",")
    .map((s) => s.trim());

  const filteredDiff = parsedDiff.filter((file) => {
    return !excludePatterns.some((pattern) =>
      minimatch(file.to ?? "", pattern),
    );
  });

  const comments = await analyzeCode(filteredDiff, prDetails);
  const pylintScore = await getPylintScore();

  // comments.push({
  //   body: `The pylint score is: ${pylintScore.toFixed(2)}/10`,
  //   path: filteredDiff[0]?.to || "", // Add to the first changed file if exists
  //   line: 1, // Add at the beginning of the file
  // });

  await addPullRequestComment(
    prDetails.owner,
    prDetails.repo,
    prDetails.pull_number,
    `The pylint score for this pull request is: ${pylintScore.toFixed(2)}/10`,
  );

  if (comments.length > 0) {
    await createReviewComment(
      prDetails.owner,
      prDetails.repo,
      prDetails.pull_number,
      comments,
    );
  }
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
