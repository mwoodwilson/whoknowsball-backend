import React from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import SetupScreen from './src/screens/SetupScreen';
import WorkoutScreen from './src/screens/WorkoutScreen';
import CompleteScreen from './src/screens/CompleteScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { RootStackParamList } from './src/types';
import { colors } from './src/theme';

const Stack = createNativeStackNavigator<RootStackParamList>();

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.bg,
    card: colors.bg,
    border: 'transparent',
    text: colors.text,
    primary: colors.primary,
    notification: colors.primary,
  },
};

export default function App() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <NavigationContainer theme={navTheme}>
        <Stack.Navigator
          initialRouteName="Setup"
          screenOptions={{
            headerShown: false,
            animation: 'slide_from_right',
            contentStyle: { backgroundColor: colors.bg },
          }}
        >
          <Stack.Screen name="Setup" component={SetupScreen} />
          <Stack.Screen
            name="Workout"
            component={WorkoutScreen}
            options={{
              gestureEnabled: false, // prevent accidental swipe-back during workout
            }}
          />
          <Stack.Screen
            name="Complete"
            component={CompleteScreen}
            options={{ gestureEnabled: false }}
          />
          <Stack.Screen name="History" component={HistoryScreen} />
        </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
