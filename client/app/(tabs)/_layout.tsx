import { Tabs } from 'expo-router';
import TabBar from '../../components/TabBar';
import { Colors } from '../../constants/Colors';

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: 'none' },
      }}
    >
      <Tabs.Screen name="index"   options={{ title: 'Home' }} />
      <Tabs.Screen name="library" options={{ title: 'Library' }} />
      <Tabs.Screen name="build"   options={{ title: 'Build' }} />
      <Tabs.Screen name="cart"    options={{ title: 'Cart' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
      {/* Kept in the tab group so expo-router can resolve the route, but not shown in the tab bar */}
      <Tabs.Screen name="saved" options={{ title: 'Saved', href: null }} />
      <Tabs.Screen name="add"   options={{ title: 'Add',   href: null }} />
    </Tabs>
  );
}
