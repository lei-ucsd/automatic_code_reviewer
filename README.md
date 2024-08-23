# AI Code Reviewer

AI Code Reviewer is a GitHub Action that uses Anthropic's Claude API to provide intelligent feedback and suggestions on
your pull requests. This powerful tool helps improve code quality and saves developers time by automating the code
review process.

## Features

- Reviews pull requests using Claude's API.
- Provides intelligent comments and suggestions for improving your code.
- Filters out files that match specified exclude patterns.
- Easy to set up and integrate into your GitHub workflow.

## Updates

1. To make any updates to the code reviewer, ONLY change `main.ts`.

2. Once all changes have been made in `main.ts`, you will need to re-build both the "lib" and "dist" folders. Follow these steps:

   a. Delete both `lib` and `dist` folders.
   
   b. Run the following command to generate the updated `lib` folder:
      ```
      npm run build
      ```
   
   c. Run the following command to generate the updated `dist` folder:
      ```
      npm run package
      ```

## Important Notes

- Always ensure you're working with the latest version of `main.ts` before making changes.
- After rebuilding, verify that the new `lib` and `dist` folders contain the expected updated files.
- It's recommended to test the changes thoroughly after rebuilding to ensure everything works as expected.

## Setup

1. To use this GitHub Action, you need an Anthropic API Key.

2. Add the Anthropic API key as a GitHub Secret in your repository with the name `ANTHROPIC_API_KEY`. You can find more
   information about GitHub Secrets [here](https://docs.github.com/en/actions/reference/encrypted-secrets).

3. Create a `.github/workflows/main.yml` file in your repository and add the following content:

```yaml
name: AI Code Reviewer

on:
  pull_request:
    types:
      - opened
      - synchronize
permissions: write-all
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Repo
        uses: actions/checkout@v3

      - name: AI Code Reviewer
        uses: your-username/ai-code-reviewer@main
        with:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }} # The GITHUB_TOKEN is there by default so you just need to keep it like it is and not necessarily need to add it as secret as it will throw an error. [More Details](https://docs.github.com/en/actions/security-guides/automatic-token-authentication#about-the-github_token-secret)
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          CLAUDE_MODEL: "gpt-4" # Optional: defaults to "gpt-4"
          exclude: "**/*.json, **/*.md" # Optional: exclude patterns separated by commas
```

4. Replace `your-username` with your GitHub username or organization name where the AI Code Reviewer repository is
   located.

5. Customize the `exclude` input if you want to ignore certain file patterns from being reviewed.

6. Commit the changes to your repository, and AI Code Reviewer will start working on your future pull requests.

## How It Works

The AI Code Reviewer GitHub Action retrieves the pull request diff, filters out excluded files, and sends code chunks to
the Anthropic API. It then generates review comments based on the AI's response and adds them to the pull request.

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests to improve the AI Code Reviewer GitHub
Action.

Let the maintainer generate the final package (`yarn build` & `yarn package`).

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for more information.
