export interface Device {
  id: string;
  clientId: string;
  token: string;
  platform: 'ios' | 'macos';
  bundleId: string;
  createdAt: string;
  updatedAt: string;
}

export interface DeviceStore {
  create(device: Device): Promise<Device>;
  get(id: string): Promise<Device | null>;
  getByToken(token: string): Promise<Device | null>;
  update(id: string, updates: Partial<Device>): Promise<Device | null>;
  delete(id: string): Promise<boolean>;
  listByClient(clientId: string): Promise<Device[]>;
}

export class MemoryDeviceStore implements DeviceStore {
  private devices: Map<string, Device> = new Map();
  private tokenIndex: Map<string, string> = new Map();

  async create(device: Device): Promise<Device> {
    this.devices.set(device.id, device);
    this.tokenIndex.set(device.token, device.id);
    return device;
  }

  async get(id: string): Promise<Device | null> {
    return this.devices.get(id) || null;
  }

  async getByToken(token: string): Promise<Device | null> {
    const id = this.tokenIndex.get(token);
    if (!id) return null;
    return this.devices.get(id) || null;
  }

  async update(id: string, updates: Partial<Device>): Promise<Device | null> {
    const existing = this.devices.get(id);
    if (!existing) return null;

    const updated: Device = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    // Update token index if token changed
    if (updates.token && updates.token !== existing.token) {
      this.tokenIndex.delete(existing.token);
      this.tokenIndex.set(updates.token, id);
    }

    this.devices.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    const device = this.devices.get(id);
    if (!device) return false;

    this.tokenIndex.delete(device.token);
    return this.devices.delete(id);
  }

  async listByClient(clientId: string): Promise<Device[]> {
    const result: Device[] = [];
    this.devices.forEach((device) => {
      if (device.clientId === clientId) {
        result.push(device);
      }
    });
    return result;
  }
}
