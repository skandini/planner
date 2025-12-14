export type DepartmentDraft = {
  name: string;
  description: string;
  organization_id: string | null;
  parent_id: string | null;
  manager_id: string | null;
};

export type DepartmentWithChildren = {
  id: string;
  name: string;
  description: string | null;
  organization_id: string | null;
  parent_id: string | null;
  manager_id: string | null;
  created_at: string;
  updated_at: string;
  children: DepartmentWithChildren[];
  employee_count: number;
  manager_name: string | null;
};
