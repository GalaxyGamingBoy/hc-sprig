import { Webhooks, createNodeMiddleware } from "@octokit/webhooks";
import { createServer } from "node:http";
import bolt from "@slack/bolt";
import dotenv from "dotenv";
import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";

dotenv.config();

// Github Webook API
const ghWebhooks = new Webhooks({
	secret: process.env.WEBHOOK_SECRET,
});

// Github App Auth
const ghAppAuth = new createAppAuth({
	appId: process.env.GH_APP_ID,
	clientId: process.env.GH_APP_CLIENTID,
	clientSecret: process.env.GH_APP_CLIENTSECRET,
	privateKey: Buffer.from(process.env.GH_APP_PRIVATE, "base64").toString(),
});

// Github Get Token for App Auth
const ghRefreshToken = async () => {
	console.log("Refreshing GH Token...");

	let jwt = (await ghAppAuth({ type: "app" })).token;

	const installation = await fetch(
		`https://api.github.com/repos/${process.env.GH_REPO}/installation`,
		{
			headers: {
				"X-GitHub-Api-Version": "2022-11-28",
				Accept: "application/vnd.github+json",
				Authorization: `Bearer ${jwt}`,
			},
		}
	).then((d) => d.json());

	const token = await fetch(installation.access_tokens_url, {
		method: "POST",
		headers: {
			"X-GitHub-Api-Version": "2022-11-28",
			Accept: "application/vnd.github+json",
			Authorization: `Bearer ${jwt}`,
		},
	}).then((d) => d.json());

	return token.token;
};

// Github Refresh Loop
const ghRefreshLoop = async () =>
	(ghOctokit = new Octokit({ auth: await ghRefreshToken() }));

let ghOctokit = new Octokit({ auth: await ghRefreshToken() });

// Slack Bolt
const slack = new bolt.App({
	appToken: process.env.SLACK_APP_TOKEN,
	token: process.env.SLACK_BOT_TOKEN,
	socketMode: true,
});

ghWebhooks.on("pull_request.labeled", (event) => {
	if (event.payload.label.name == process.env.PR_LABEL || "submissions") {
		if (/^.+\$SLACK_THREAD:([A-Z0-9]+);([0-9]+.[0-9]+)/gm.test(event.payload.pull_request.body)) return;

		const title = `Sprig Game Submission - ${event.payload.pull_request.title}`;
		const pr = event.payload.number;

		// Post submission message
		slack.client.chat
			.postMessage({
				channel: process.env.SLACK_CHANNEL,
				text: "New Sprig Game Submission",
				unfurl_media: false,
				unfurl_links: false,
				blocks: [
					{
						type: "header",
						text: {
							type: "plain_text",
							text: "New Game Submission :tada:",
							emoji: true,
						},
						// BLOCK ID: PR_
						block_id: `${pr};${event.payload.pull_request.head.repo.owner.login}/${event.payload.pull_request.head.repo.name}`,
					},
					{
						type: "section",
						text: {
							type: "mrkdwn",
							text: `*Title*: [#${pr}] ${title}`,
						},
					},
					{
						type: "section",
						text: {
							type: "mrkdwn",
							text: "Want to participate and help in review by contributing?",
						},
					},
					{
						type: "actions",
						elements: [
							{
								type: "button",
								text: {
									type: "plain_text",
									text: "View PR",
									emoji: true,
								},
								url: event.payload.pull_request.html_url,
							},
							{
								type: "button",
								text: {
									type: "plain_text",
									text: "Play Preview",
									emoji: true,
								},
								url: `${process.env.SPRIG_URL}/gallery/${title}?pr=${pr}`,
							},
						],
					},
				],
			})
			.then(async (msg) => {
				if (!msg.ok) return;

				await ghOctokit.pulls.update({
					owner: event.payload.repository.owner.login,
					repo: event.payload.repository.name,
					pull_number: event.payload.pull_request.number,
					body: `<!-- DO NOT REMOVE | $SLACK_THREAD:${msg.channel};${msg.ts} -->  \n${event.payload.pull_request.body}`,
				});

				// Reply to parent message with the description
				await slack.client.chat.postMessage({
					thread_ts: msg.ts,
					text: "Sprig Game Submission Description",
					unfurl_links: false,
					unfurl_media: false,
					channel: process.env.SLACK_CHANNEL,
					blocks: [
						{
							type: "section",
							text: {
								type: "mrkdwn",
								text: "*Description*: ",
							},
						},
						{
							type: "section",
							text: {
								type: "mrkdwn",
								text: event.payload.pull_request.body,
							},
						},
					],
				});
			});
	}
});

ghWebhooks.on("issue_comment.created", (event) => {
	if (event.payload.sender.type == "Bot") return;
	if (!/^.+\$SLACK_THREAD:([A-Z0-9]+);([0-9]+.[0-9]+)/gm.test(event.payload.issue.body)) return;

	let body = event.payload.issue.body.split("\n")[0]
	body = /^.+\$SLACK_THREAD:([A-Z0-9]+);([0-9]+.[0-9]+)/gm.exec(body)

	const data = { channel: body[1], ts: body[2] }
	slack.client.chat.postMessage({
		channel: data.channel, thread_ts: data.ts, text: `[Github] ${event.payload.sender.login}: ${event.payload.comment.body}`
	})
})

slack.event("message", async ({ say, message }) => {
	if (message.parent_user_id != "U073JUJ20E9") return;

	const parentThread = await slack.client.conversations.history({
		channel: process.env.SLACK_CHANNEL,
		latest: message.thread_ts,
		limit: 1,
		inclusive: true,
	});

	const parentData = parentThread.messages[0].blocks[0].block_id.split(";");
	const parentPR = parentData[0];

	const user = await slack.client.users.profile.get({ user: message.user });

	await ghOctokit.issues.createComment({
		issue_number: parentPR,
		owner: process.env.GH_REPO.split("/")[0],
		repo: process.env.GH_REPO.split("/")[1],
		body: `[Slack] ${user.profile.display_name}: ${message.text}`,
	});
});

// Start Github Loop and refresh octokit every 58 minutes
setInterval(ghRefreshLoop, 1000 * 60 * 58);

// Start Slack
slack.start();

// Start Webhook Server
console.log(`Running black magic on ${process.env.PORT}`);
createServer(createNodeMiddleware(ghWebhooks)).listen(process.env.PORT);
