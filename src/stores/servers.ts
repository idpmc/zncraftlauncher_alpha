import { defineStore } from 'pinia'
import { ref } from 'vue'
import { i18n } from '../locales'

export interface Server {
  id: string
  name: string
  ip: string
  port: number
  players?: number
  maxPlayers?: number
  motd?: string
  icon?: string
  pinged: boolean
}

export const useServersStore = defineStore('servers', () => {
  const servers = ref<Server[]>([
    {
      id: '1',
      name: 'Hypixel',
      ip: 'mc.hypixel.net',
      port: 25565,
      players: 54321,
      maxPlayers: 60000,
      motd: i18n.global.t('rt.stServers.hypixelMotd'),
      icon: undefined,
      pinged: true
    },
    {
      id: '2',
      name: 'Mineplex',
      ip: 'us.mineplex.com',
      port: 25565,
      players: 8901,
      maxPlayers: 10000,
      motd: i18n.global.t('rt.stServers.mineplexMotd'),
      icon: undefined,
      pinged: true
    },
    {
      id: '3',
      name: i18n.global.t('rt.stServers.localTestName'),
      ip: 'localhost',
      port: 25565,
      motd: i18n.global.t('rt.stServers.localTestMotd'),
      icon: undefined,
      pinged: false
    }
  ])

  const addServer = (server: Server) => {
    servers.value.push(server)
  }

  const deleteServer = (serverId: string) => {
    const index = servers.value.findIndex(s => s.id === serverId)
    if (index > -1) {
      servers.value.splice(index, 1)
    }
  }

  const pingServer = (serverId: string) => {
    const server = servers.value.find(s => s.id === serverId)
    if (server) {
      server.pinged = true
      server.players = Math.floor(Math.random() * 100)
      server.maxPlayers = 100
    }
  }

  const connectToServer = (serverId: string) => {
    const server = servers.value.find(s => s.id === serverId)
    if (server) {
      console.log(`Connecting to ${server.name} (${server.ip}:${server.port})...`)
    }
  }

  const directConnect = (address: string) => {
    console.log(`Direct connecting to ${address}...`)
  }

  return {
    servers,
    addServer,
    deleteServer,
    pingServer,
    connectToServer,
    directConnect
  }
})
