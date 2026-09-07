# CI and delivery

Changes to `main`, CI branches and pull requests run the project checks. Use **Actions → CI and delivery → Run workflow** for a manual repeat. Any failed step blocks delivery in this workflow.

Public static site. Successful default-branch checks gate GitHub Pages deployment; branch and pull-request runs never deploy.

GitHub Pages deploys the checked artifact from the same run on the default branch only. Revert a bad commit to roll back through the same checks.

CI receives no production secrets. It does not send outreach, process customer records, execute trades or run live business automations. Configure hosting and release credentials separately before claiming production deployment. Existing provider integrations are unchanged.

Actions are pinned to verified upstream commit SHAs. Update pins deliberately. Keep tests and delivery allowlists current as the product changes. Never upload runtime databases, `.env` files, credentials or personal datasets.
