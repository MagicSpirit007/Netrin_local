import type { ComponentType } from 'react'
import { HomeScreen } from './screens/HomeScreen'
import { DiscoverScreen } from './screens/DiscoverScreen'
import { CreateScreen } from './screens/CreateScreen'
import { ProfileScreen } from './screens/ProfileScreen'

// Maps a manifest navigation id -> its screen component and route path.
// Both the <Routes> and the <BottomTabBar> iterate manifest.navigation.items,
// so adding/removing a tab in the manifest changes the app shell.
export const screenForTab: Record<string, ComponentType> = {
  home: HomeScreen,
  discover: DiscoverScreen,
  create: CreateScreen,
  profile: ProfileScreen
}

export const pathForTab = (id: string): string => (id === 'home' ? '/' : `/${id}`)
