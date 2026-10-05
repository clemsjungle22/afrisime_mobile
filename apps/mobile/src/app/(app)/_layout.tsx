import { Stack } from 'expo-router';

/** Zone principale de l'app. La garde de session (redirection vers l'auth) sera ajoutée ici. */
export default function AppLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
