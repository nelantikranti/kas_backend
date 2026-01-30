export interface User {
  id: string;
  name: string;
  email: string;
  role: "Admin" | "Sales Executive" | "Service Engineer" | "Project Manager" | "Accounts" | "Manager" | "Technician" | "Accountant";
  status: "Active" | "Inactive";
  lastLogin: string;
}

let users: User[] = [
  {
    id: "U001",
    name: "Admin User",
    email: "admin@kas.com",
    role: "Admin",
    status: "Active",
    lastLogin: "2025-01-24",
  },
  {
    id: "U002",
    name: "Sales Executive 1",
    email: "sales1@kas.com",
    role: "Sales Executive",
    status: "Active",
    lastLogin: "2025-01-24",
  },
  {
    id: "U003",
    name: "Sales Executive 2",
    email: "sales2@kas.com",
    role: "Sales Executive",
    status: "Active",
    lastLogin: "2025-01-23",
  },
  {
    id: "U004",
    name: "Engineer 1",
    email: "engineer1@kas.com",
    role: "Service Engineer",
    status: "Active",
    lastLogin: "2025-01-24",
  },
  {
    id: "U005",
    name: "Project Manager 1",
    email: "pm1@kas.com",
    role: "Project Manager",
    status: "Active",
    lastLogin: "2025-01-22",
  },
];

export const getUsers = () => users;
export const getUserById = (id: string) => users.find(u => u.id === id);
export const addUser = (user: Omit<User, "id" | "lastLogin">) => {
  const newUser: User = {
    ...user,
    id: `U${String(users.length + 1).padStart(3, "0")}`,
    lastLogin: new Date().toISOString().split("T")[0],
  };
  users.push(newUser);
  return newUser;
};
export const updateUser = (id: string, updates: Partial<User>) => {
  const index = users.findIndex(u => u.id === id);
  if (index === -1) return null;
  users[index] = { ...users[index], ...updates };
  return users[index];
};
export const deleteUser = (id: string) => {
  const index = users.findIndex(u => u.id === id);
  if (index === -1) return false;
  users.splice(index, 1);
  return true;
};









