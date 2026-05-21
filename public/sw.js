self.addEventListener("push", (event) => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const callId = payload.callId || crypto.randomUUID();
  const params = new URLSearchParams({
    incomingCall: "1",
    callId,
    from: payload.from || "Your agent",
  });

  if (payload.reason) params.set("reason", payload.reason);

  const url = `/?${params.toString()}`;

  event.waitUntil(
    self.registration.showNotification(payload.title || "Your agent is calling", {
      body: payload.body || "Tap to answer.",
      icon: "/icons/icon-192.png",
      badge: "/favicon-32x32.png",
      tag: `call-my-agent-${callId}`,
      requireInteraction: true,
      data: { url },
      actions: [
        { action: "answer", title: "Answer" },
        { action: "decline", title: "Decline" },
      ],
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  if (event.action === "decline") return;

  const url = event.notification.data?.url || "/";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          const clientUrl = new URL(client.url);
          if (clientUrl.origin === self.location.origin && "focus" in client) {
            client.navigate(url);
            return client.focus();
          }
        }

        return clients.openWindow(url);
      }),
  );
});
