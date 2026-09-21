import { NavigatorScreenParams } from '@react-navigation/native';

export type AuthStackParamList = {
  Login: undefined;
  BiometricGate: undefined;
};

export type HomeStackParamList = {
  Home: undefined;
  Punch: undefined;
  Scan: undefined;
};

export type AttendanceStackParamList = {
  MyAttendance: undefined;
  AttendanceDayDetail: { date: string };
  CorrectionRequestForm: { date: string };
};

export type ScheduleStackParamList = {
  Schedule: undefined;
};

export type LeaveStackParamList = {
  Leave: undefined;
  LeaveRequestForm: undefined;
};

export type ApplicationsStackParamList = {
  Applications: undefined;
};

export type SettingsStackParamList = {
  Privacy: undefined;
  LocationAccessLog: undefined;
};

export type NotificationsStackParamList = {
  Notifications: undefined;
};

export type MainTabsParamList = {
  HomeTab: NavigatorScreenParams<HomeStackParamList>;
  AttendanceTab: NavigatorScreenParams<AttendanceStackParamList>;
  ScheduleTab: NavigatorScreenParams<ScheduleStackParamList>;
  LeaveTab: NavigatorScreenParams<LeaveStackParamList>;
  ApplicationsTab: NavigatorScreenParams<ApplicationsStackParamList>;
};

export type RootStackParamList = {
  AuthStack: NavigatorScreenParams<AuthStackParamList>;
  ForcePasswordChange: undefined;
  MainTabs: NavigatorScreenParams<MainTabsParamList>;
  NotificationsModal: NavigatorScreenParams<NotificationsStackParamList>;
  SettingsModal: NavigatorScreenParams<SettingsStackParamList>;
};
