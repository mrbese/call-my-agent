# Call My Agent

A private phone line between you and your OpenClaw agent. No Twilio. No phone number.

Call My Agent is a local-first browser voice app for OpenClaw. You can call your
agent from your phone, and your agent can call you through private incoming-call
notifications. It runs on your machine, uses your existing OpenClaw OpenAI auth
profiles, and exposes phone access through your own Tailscale network.

No signup. No hosted Call My Agent backend. No Call My Agent API. No Twilio. No
phone number rental.

## What It Does

- Starts live voice sessions with your OpenClaw agent from a phone or laptop.
- Lets your agent send an incoming-call notification to your phone.
- Uses OpenAI Realtime for speech in and speech out.
- Uses OpenClaw for actual agent work through `openclaw_agent_consult`.
- Uses your existing OpenClaw `openai:*` auth profiles before any env fallback.
- Runs locally and binds to `127.0.0.1` by default.
- Uses Tailscale Serve for private phone access outside the host machine.

Call My Agent creates internet voice sessions, not carrier/PSTN calls. The
"phone line" is a private voice path between your phone browser and your local
OpenClaw agent.

## Why This Exists

Most voice-agent setups make you rent a phone number, configure Twilio, run a
public webhook, or send traffic through a hosted voice backend. That is more
setup, more cost, and more surface area than a personal OpenClaw agent needs.

Call My Agent keeps the loop small:

```text
phone browser
  -> Tailscale
  -> local Call My Agent app
  -> OpenAI Realtime
  -> local OpenClaw agent
```

Your API keys stay in your OpenClaw setup. Your agent stays on your machine.
Remote access stays inside your tailnet.

The only external API used by the voice app is OpenAI Realtime, called directly
from your local app process using your own OpenAI credentials or your existing
OpenClaw auth profile.

## Privacy And Security

Call My Agent is designed so there is no Call My Agent account and no Call My
Agent service receiving your secrets. There is no hosted backend for us to log
into, inspect, or query. At this point, Call My Agent has no knowledge of your
usage because there is no Call My Agent API in the request path.

- No Call My Agent signup.
- No hosted Call My Agent backend.
- No Call My Agent cloud API.
- No Twilio account.
- No phone number rental.
- No ngrok tunnel required.
- No API keys collected by Call My Agent.
- No OpenClaw credentials sent to Call My Agent.
- Uses your existing OpenClaw OpenAI auth profiles.
- Falls back to local environment variables only if configured.
- Runs on your own machine.
- Binds locally to `127.0.0.1` by default.
- Uses your own Tailscale network for remote phone access.
- Incoming calls use browser Web Push from your own local app.

For remote access, use Tailscale Serve. Avoid binding the app to `0.0.0.0` or
putting it behind a public tunnel unless you have a clear reason and understand
the risk.

## Requirements

- OpenClaw installed and configured.
- An OpenClaw `openai:*` auth profile with Realtime-capable OpenAI access.
- Node.js and npm.
- Tailscale, if you want to call your agent from your phone while away from the
  host machine.
- A browser that supports microphone access. For incoming-call notifications,
  use a browser/device that supports Web Push.

## Quick Start

Recommended OpenClaw install path:

```bash
openclaw plugins install clawhub:@mrbese/call-my-agent@0.1.2
```

This installs the ClawHub package that contains the app and the setup skill.
GitHub remains the public source and provenance link, but ClawHub is the
auditable install surface.

Manual source checkout for development:

```bash
cd call-my-agent
npm install
npm run setup:openclaw
npm run dev
```

Open the local URL from Next.js, usually:

```text
http://127.0.0.1:3000
```

Tap **Call My Agent** in the current local app UI to start a voice session.

The public ClawHub package is named `@mrbese/call-my-agent`.

Check the local setup at any time:

```bash
npm run doctor
```

## Setup Choices

Call My Agent v1 is focused on OpenClaw. The packaged skill should set up one
private phone line for one OpenClaw agent, usually `main`.

The setup skill should:

1. Detect available OpenClaw agents, starting with `main`.
2. Detect existing OpenClaw `openai:*` auth profiles.
3. If a usable OpenAI profile exists, configure Call My Agent automatically.
4. If no usable OpenAI profile exists, ask for an OpenAI API key and save it as
   an OpenClaw auth profile, not as a Call My Agent-specific secret.
5. Generate `.env.local` with non-secret runtime settings.
6. Install dependencies.
7. Start the local service.
8. Configure Tailscale Serve if the user wants phone access.
9. Print the private URL and privacy check.

For OpenClaw users, setup should feel like:

```bash
openclaw call-my-agent setup
```

If OpenClaw already has OpenAI auth, the agent should set everything up by
itself. If not, it should ask for the key once and store it in OpenClaw's normal
auth system.

Voice transport and agent runtime are separate. The app uses OpenAI Realtime for
live speech. The agent runtime is what receives deeper consult requests after
the live voice model decides it needs the agent.

Hermes and custom local agent command support are good follow-up adapters, but
they should not block the first ClawHub and GitHub release.

## OpenClaw Auth

Call My Agent prefers existing OpenClaw OpenAI auth profiles. It reads profiles
for `OPENCLAW_AGENT_ID`, defaults to `main`, and tries OpenAI profiles in the
order configured by OpenClaw.

Add or update OpenClaw auth like this:

```bash
openclaw models auth paste-token --provider openai --profile-id openai:default
openclaw models auth order set --provider openai --agent main openai:default
```

To add a backup key for all OpenClaw usage, not just Call My Agent:

```bash
openclaw models auth paste-token --provider openai --profile-id openai:backup
openclaw models auth order set --provider openai --agent main openai:default openai:backup
```

Call My Agent accepts both OpenClaw `api_key` and `token` profile shapes.

`OPENAI_API_KEY` is only an optional local fallback for development or unusual
setups where OpenClaw auth profiles are unavailable.

Some users may not have OpenClaw auth configured yet, or may want to use a
separate OpenAI API key only for voice. That is fine. Put the key in
`.env.local`:

```bash
OPENAI_API_KEY=<your-openai-api-key>
```

This key is read by the local app process. It is used to create short-lived
OpenAI Realtime client secrets. It is not sent to Call My Agent because there is
no Call My Agent hosted backend.

## Tailscale Access

For phone access, expose the local app privately with Tailscale Serve:

```bash
npm run tailscale:setup
```

Then open the Tailscale HTTPS URL on your phone.

Example:

```text
https://your-machine.your-tailnet.ts.net:8443/
```

To disable Tailscale Serve:

```bash
npm run tailscale:teardown
```

To inspect the current Serve config:

```bash
npm run tailscale:status
```

Do not publish this app through a public tunnel by default. Tailscale is the
intended safety boundary for remote use.

## Incoming Calls

Incoming calls are private Web Push notifications from your local app.

Setup:

1. Open the app on your phone through the Tailscale URL.
2. Tap **Enable** in the Incoming Calls panel.
3. Set `CALL_MY_AGENT_CALL_TOKEN` in `.env.local` before exposing the app remotely.
4. Restart the app after changing `.env.local`.

Trigger an incoming call locally:

```bash
curl -X POST http://127.0.0.1:3000/api/inbound-call \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $CALL_MY_AGENT_CALL_TOKEN" \
  -d '{"reason":"Quick check-in","body":"Tap to answer."}'
```

If `CALL_MY_AGENT_CALL_TOKEN` is empty, the endpoint currently allows local
development requests without authorization. Set the token for any non-local or
Tailscale-exposed setup.

## Environment

```bash
OPENAI_API_KEY=
OPENAI_REALTIME_MODEL=gpt-realtime
OPENAI_REALTIME_VOICE=cedar
NEXT_PUBLIC_OPENAI_REALTIME_MODEL=gpt-realtime
NEXT_PUBLIC_OPENAI_REALTIME_VOICE=cedar
OPENCLAW_AGENT_ID=main
OPENCLAW_CONSULT_THINKING=low
OPENCLAW_CONSULT_TIMEOUT_MS=90000
OPENCLAW_WORKSPACE_DIR=/Users/you/.openclaw/workspace
WEB_PUSH_SUBJECT=https://your-machine.your-tailnet.ts.net:8443
WEB_PUSH_PUBLIC_KEY=
WEB_PUSH_PRIVATE_KEY=
CALL_MY_AGENT_CALL_TOKEN=
```

### Required Or Recommended

- `OPENCLAW_AGENT_ID`: OpenClaw agent used by `openclaw_agent_consult`.
  Defaults to `main`.
- `OPENCLAW_WORKSPACE_DIR`: Workspace root used for compact voice context.
- `CALL_MY_AGENT_CALL_TOKEN`: Recommended for incoming calls, especially with
  Tailscale access enabled.

### Optional Realtime Settings

- `OPENAI_REALTIME_MODEL`: Server-side realtime model. Defaults to
  `gpt-realtime`.
- `OPENAI_REALTIME_VOICE`: Server-side voice. Defaults to `cedar`.
- `NEXT_PUBLIC_OPENAI_REALTIME_MODEL`: Client-side display/session model.
- `NEXT_PUBLIC_OPENAI_REALTIME_VOICE`: Client-side displayed voice.

### Optional OpenClaw Consult Settings

- `OPENCLAW_CONSULT_THINKING`: Thinking level for consult runs.
- `OPENCLAW_CONSULT_TIMEOUT_MS`: Consult timeout. Defaults to `90000`.

### Optional Web Push Settings

- `WEB_PUSH_SUBJECT`: VAPID subject. For remote use, set this to your Tailscale
  HTTPS origin.
- `WEB_PUSH_PUBLIC_KEY` and `WEB_PUSH_PRIVATE_KEY`: Stable VAPID keys. If unset,
  generated keys are persisted in `data/vapid-keys.json`.

## Voice Architecture

The browser starts the realtime session. The server creates a short-lived
OpenAI Realtime client secret using the first working OpenClaw OpenAI profile.

The realtime model receives local instructions and tools:

- `openclaw_agent_consult`: routes deeper work to OpenClaw with
  `openclaw agent --agent <OPENCLAW_AGENT_ID> --session-id <voice-session> --json`.
- `schedule_openclaw_reminder`: creates one-shot OpenClaw cron jobs with `--at`,
  `--system-event`, and `--delete-after-run`.

Reminder times should be relative durations like `20m`, `2h`, `1d`, or ISO
datetimes with a timezone offset.

Compact identity and workspace context is injected once at session setup.

## Home Screen App

The app includes PWA metadata and a home-screen icon:

- `public/manifest.webmanifest`
- `public/apple-touch-icon.png`

On iPhone, open the Tailscale URL in Safari and choose **Add to Home Screen**.

## Local Service

For always-on local usage, build once and run the app with your preferred
process manager:

```bash
npm run build
npm run start -- --hostname 127.0.0.1 --port 3000
```

On macOS, use the LaunchAgent template:

```text
deploy/macos/ai.openclaw.call-my-agent.plist
```

Replace `__APP_DIR__` with the absolute app path and `__PORT__` with `3000`,
then install it:

```bash
mkdir -p logs
sed -e "s#__APP_DIR__#$(pwd)#g" -e "s#__PORT__#3000#g" \
  deploy/macos/ai.openclaw.call-my-agent.plist \
  > ~/Library/LaunchAgents/ai.openclaw.call-my-agent.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/ai.openclaw.call-my-agent.plist
```

To stop the macOS service:

```bash
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/ai.openclaw.call-my-agent.plist
```

On Linux, use the systemd user service template:

```text
deploy/linux/call-my-agent.service
```

Replace `__APP_DIR__` and `__PORT__`, then install it:

```bash
mkdir -p ~/.config/systemd/user
sed -e "s#__APP_DIR__#$(pwd)#g" -e "s#__PORT__#3000#g" \
  deploy/linux/call-my-agent.service \
  > ~/.config/systemd/user/call-my-agent.service
systemctl --user daemon-reload
systemctl --user enable --now call-my-agent.service
```

To stop the Linux service:

```bash
systemctl --user disable --now call-my-agent.service
```

## ClawHub Package

The ClawHub package includes:

- `openclaw.plugin.json`, so OpenClaw can inspect the package before loading
  runtime behavior.
- `skills/call-my-agent/SKILL.md`, so agents use the packaged app root instead
  of cloning GitHub during normal setup.
- The local Next.js app, setup scripts, service templates, and Tailscale helper.

Useful package commands:

```bash
npm run setup:openclaw
npm run setup:openclaw -- --install
npm run doctor
npm run tailscale:setup
npm run tailscale:teardown
```

The setup command should print a privacy check:

```text
Call My Agent privacy check:

App hosting:        your machine
Voice transport:    OpenAI Realtime API
Agent runtime:      local OpenClaw
Remote access:      your Tailscale network
Phone provider:     none
Hosted backend:     none
App account:        none
API keys collected: no
```

## Trust Boundaries

Call My Agent can help the user talk to an agent, but the agent still has the
same permissions the user gave OpenClaw. External actions such as sending
emails, messages, posts, purchases, or destructive file operations should remain
confirmation-gated by the agent's normal policy.

The voice app should not weaken OpenClaw's existing permission boundaries. It
only changes the interface from text to voice.

## Troubleshooting

### No OpenAI API Key Found

Add an OpenClaw `openai:*` auth profile:

```bash
openclaw models auth paste-token --provider openai --profile-id openai:default
```

Then restart the app.

### The Phone Cannot Open The App

Check that Tailscale is running on both devices and that Tailscale Serve is
enabled:

```bash
tailscale serve status
```

Then confirm the app is running locally:

```bash
curl http://127.0.0.1:3000/api/tools
```

### Incoming Calls Do Not Arrive

- Open the app on the phone through the Tailscale HTTPS URL.
- Enable incoming-call notifications in the app.
- Make sure `WEB_PUSH_SUBJECT` matches the HTTPS origin.
- Make sure the phone browser supports Web Push.
- Check whether old push subscriptions were removed after delivery failures.

### Microphone Does Not Work

- Use an HTTPS URL on phone. The Tailscale Serve URL provides HTTPS.
- Allow microphone permissions in the browser.
- Try removing and re-adding the home-screen app.

## Development Notes

Before publishing, verify source strings, package metadata, service names,
environment variable names, and generated assets are generic.

Do not publish generated local state:

- `node_modules/`
- `.next/`
- `data/*.json`
- `logs/`
- `.env.local`
