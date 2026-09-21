import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { useAuth } from '../auth/AuthContext';
import { BiometricGateScreen } from '../screens/auth/BiometricGateScreen';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { AuthStackParamList } from './types';

const Stack = createNativeStackNavigator<AuthStackParamList>();

export function AuthStack() {
  const { status } = useAuth();
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {status === 'NEEDS_BIOMETRIC' ? (
        <Stack.Screen name="BiometricGate" component={BiometricGateScreen} />
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} />
      )}
    </Stack.Navigator>
  );
}
