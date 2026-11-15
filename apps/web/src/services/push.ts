export async function requirePushPermission(
  supported: () => Promise<boolean>,
  request: () => Promise<NotificationPermission>,
) {
  if (!(await supported()))
    throw new Error(
      'This browser does not support web push. Email and in-app updates remain available.',
    );
  if ((await request()) !== 'granted')
    throw new Error('Notifications were not allowed. Email and in-app updates remain available.');
}
