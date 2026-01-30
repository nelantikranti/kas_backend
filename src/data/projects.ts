export type ProjectStage = 
  | "Order Confirmed"
  | "Design & Engineering"
  | "Material Procurement"
  | "Installation Process"
  | "Testing & QA"
  | "Handover";

export interface Project {
  id: string;
  quotationId: string;
  customerName: string;
  projectName: string;
  location: string;
  elevatorType: string;
  currentStage: ProjectStage;
  startDate: string;
  expectedCompletion: string;
  progress: number;
  assignedEngineer: string;
  status: "On Track" | "Delayed" | "On Hold";
}

let projects: Project[] = [
  {
    id: "P001",
    quotationId: "Q002",
    customerName: "Sneha Reddy",
    projectName: "Luxury Apartments - Building A",
    location: "Mumbai, Maharashtra",
    elevatorType: "Premium Passenger Elevator",
    currentStage: "Installation Process",
    startDate: "2025-01-20",
    expectedCompletion: "2025-03-15",
    progress: 65,
    assignedEngineer: "Engineer 1",
    status: "On Track",
  },
  {
    id: "P002",
    quotationId: "Q001",
    customerName: "Rajesh Kumar",
    projectName: "Tech Park - Tower 1",
    location: "Bangalore, Karnataka",
    elevatorType: "Passenger Elevator",
    currentStage: "Design & Engineering",
    startDate: "2025-01-25",
    expectedCompletion: "2025-04-10",
    progress: 25,
    assignedEngineer: "Engineer 2",
    status: "On Track",
  },
  {
    id: "P003",
    quotationId: "Q003",
    customerName: "Priya Sharma",
    projectName: "Green Heights - Block B",
    location: "Pune, Maharashtra",
    elevatorType: "Passenger Elevator",
    currentStage: "Material Procurement",
    startDate: "2025-01-28",
    expectedCompletion: "2025-04-20",
    progress: 40,
    assignedEngineer: "Engineer 1",
    status: "On Track",
  },
];

const projectStages: ProjectStage[] = [
  "Order Confirmed",
  "Design & Engineering",
  "Material Procurement",
  "Installation Process",
  "Testing & QA",
  "Handover",
];

export const getProjects = () => projects;
export const getProjectById = (id: string) => projects.find(p => p.id === id);
export const addProject = (project: Omit<Project, "id" | "progress">) => {
  const stageIndex = projectStages.indexOf(project.currentStage);
  const progress = ((stageIndex + 1) / projectStages.length) * 100;
  
  const newProject: Project = {
    ...project,
    id: `P${String(projects.length + 1).padStart(3, "0")}`,
    progress,
  };
  projects.push(newProject);
  return newProject;
};
export const updateProject = (id: string, updates: Partial<Project>) => {
  const index = projects.findIndex(p => p.id === id);
  if (index === -1) return null;
  
  if (updates.currentStage) {
    const stageIndex = projectStages.indexOf(updates.currentStage);
    updates.progress = ((stageIndex + 1) / projectStages.length) * 100;
  }
  
  projects[index] = { ...projects[index], ...updates };
  return projects[index];
};
export const deleteProject = (id: string) => {
  const index = projects.findIndex(p => p.id === id);
  if (index === -1) return false;
  projects.splice(index, 1);
  return true;
};






















