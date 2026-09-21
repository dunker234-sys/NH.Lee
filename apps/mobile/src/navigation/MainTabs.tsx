import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import { createNativeStackNavigator, NativeStackNavigationProp } from '@react-navigation/native-stack';
import React from 'react';
import { Pressable, Text } from 'react-native';
import { useAccessibilityPrefs } from '../accessibility/AccessibilityPrefsContext';
import { useLocale } from '../i18n/LocaleContext';
import { useQueueStatus } from '../offline/useQueueStatus';
import { AttendanceDayDetailScreen } from '../screens/attendance/AttendanceDayDetailScreen';
import { CorrectionRequestFormScreen } from '../screens/attendance/CorrectionRequestFormScreen';
import { MyAttendanceScreen } from '../screens/attendance/MyAttendanceScreen';
import { ApplicationsScreen } from '../screens/applications/ApplicationsScreen';
import { HomeScreen } from '../screens/home/HomeScreen';
import { LeaveScreen } from '../screens/leave/LeaveScreen';
import { LeaveRequestFormScreen } from '../screens/leave/LeaveRequestFormScreen';
import { PunchScreen } from '../screens/punch/PunchScreen';
import { ScanScreen } from '../screens/punch/ScanScreen';
import { ScheduleScreen } from '../screens/schedule/ScheduleScreen';
import {
  AttendanceStackParamList,
  HomeStackParamList,
  LeaveStackParamList,
  ApplicationsStackParamList,
  MainTabsParamList,
  RootStackParamList,
  ScheduleStackParamList,
} from './types';
import { MIN_TOUCH_TARGET } from '../theme/tokens';

const Tab = createBottomTabNavigator<MainTabsParamList>();
const HomeStackNav = createNativeStackNavigator<HomeStackParamList>();
const AttendanceStackNav = createNativeStackNavigator<AttendanceStackParamList>();
const ScheduleStackNav = createNativeStackNavigator<ScheduleStackParamList>();
const LeaveStackNav = createNativeStackNavigator<LeaveStackParamList>();
const ApplicationsStackNav = createNativeStackNavigator<ApplicationsStackParamList>();

function HeaderIcons() {
  const { palette, fs } = useAccessibilityPrefs();
  const { pendingCount } = useQueueStatus();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <>
      <Pressable
        accessibilityRole="button"
        onPress={() => navigation.navigate('NotificationsModal', { screen: 'Notifications' })}
        style={{ minWidth: MIN_TOUCH_TARGET, minHeight: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' }}
      >
        <Text style={{ fontSize: fs(20), color: palette.text }}>{pendingCount > 0 ? '🔔•' : '🔔'}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() => navigation.navigate('SettingsModal', { screen: 'Privacy' })}
        style={{ minWidth: MIN_TOUCH_TARGET, minHeight: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' }}
      >
        <Text style={{ fontSize: fs(20), color: palette.text }}>⚙️</Text>
      </Pressable>
    </>
  );
}

function HomeStack() {
  const { t } = useLocale();
  return (
    <HomeStackNav.Navigator>
      <HomeStackNav.Screen name="Home" component={HomeScreen} options={{ title: t('nav_home'), headerRight: HeaderIcons }} />
      <HomeStackNav.Screen name="Punch" component={PunchScreen} options={{ title: t('punch_screen_title') }} />
      <HomeStackNav.Screen name="Scan" component={ScanScreen} options={{ title: t('scan_screen_title') }} />
    </HomeStackNav.Navigator>
  );
}

function AttendanceStack() {
  const { t } = useLocale();
  return (
    <AttendanceStackNav.Navigator>
      <AttendanceStackNav.Screen name="MyAttendance" component={MyAttendanceScreen} options={{ title: t('nav_attendance') }} />
      <AttendanceStackNav.Screen
        name="AttendanceDayDetail"
        component={AttendanceDayDetailScreen}
        options={{ title: t('attendance_day_detail_title') }}
      />
      <AttendanceStackNav.Screen
        name="CorrectionRequestForm"
        component={CorrectionRequestFormScreen}
        options={{ title: t('correction_form_title') }}
      />
    </AttendanceStackNav.Navigator>
  );
}

function ScheduleStack() {
  const { t } = useLocale();
  return (
    <ScheduleStackNav.Navigator>
      <ScheduleStackNav.Screen name="Schedule" component={ScheduleScreen} options={{ title: t('nav_schedule') }} />
    </ScheduleStackNav.Navigator>
  );
}

function LeaveStack() {
  const { t } = useLocale();
  return (
    <LeaveStackNav.Navigator>
      <LeaveStackNav.Screen name="Leave" component={LeaveScreen} options={{ title: t('nav_leave') }} />
      <LeaveStackNav.Screen name="LeaveRequestForm" component={LeaveRequestFormScreen} options={{ title: t('leave_request_new') }} />
    </LeaveStackNav.Navigator>
  );
}

function ApplicationsStack() {
  const { t } = useLocale();
  return (
    <ApplicationsStackNav.Navigator>
      <ApplicationsStackNav.Screen name="Applications" component={ApplicationsScreen} options={{ title: t('nav_applications') }} />
    </ApplicationsStackNav.Navigator>
  );
}

const TAB_ICONS: Record<keyof MainTabsParamList, string> = {
  HomeTab: '🏠',
  AttendanceTab: '📅',
  ScheduleTab: '🗓️',
  LeaveTab: '🌴',
  ApplicationsTab: '📄',
};

/** 탭바는 5개로 제한한다(계획서 §1) — 알림/개인정보는 헤더 아이콘으로 뺀다. */
export function MainTabs() {
  const { t } = useLocale();
  const { palette, fs } = useAccessibilityPrefs();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: palette.primary,
        tabBarInactiveTintColor: palette.textMuted,
        tabBarLabelStyle: { fontSize: fs(11) },
        tabBarIcon: () => <Text style={{ fontSize: fs(18) }}>{TAB_ICONS[route.name as keyof MainTabsParamList]}</Text>,
        tabBarStyle: { minHeight: MIN_TOUCH_TARGET + 8 },
      })}
    >
      <Tab.Screen name="HomeTab" component={HomeStack} options={{ tabBarLabel: t('nav_home') }} />
      <Tab.Screen name="AttendanceTab" component={AttendanceStack} options={{ tabBarLabel: t('nav_attendance') }} />
      <Tab.Screen name="ScheduleTab" component={ScheduleStack} options={{ tabBarLabel: t('nav_schedule') }} />
      <Tab.Screen name="LeaveTab" component={LeaveStack} options={{ tabBarLabel: t('nav_leave') }} />
      <Tab.Screen name="ApplicationsTab" component={ApplicationsStack} options={{ tabBarLabel: t('nav_applications') }} />
    </Tab.Navigator>
  );
}
