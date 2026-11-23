export type NotificationMessage = { recipient: string; title: string; body: string; href?: string };
export interface NotificationChannel {
  send(message: NotificationMessage): Promise<{ providerId: string }>;
}
// Supply provider-backed implementations from a worker when email or mobile push is enabled.
export type ExternalNotificationChannels = {email?:NotificationChannel;push?:NotificationChannel};
