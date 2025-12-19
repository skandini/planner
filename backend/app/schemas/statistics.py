from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class DepartmentStatistics(BaseModel):
    """Statistics for a department."""
    
    department_id: Optional[UUID] = None
    department_name: Optional[str] = None
    total_meetings: int = Field(default=0, description="Total number of meetings")
    total_minutes: int = Field(default=0, description="Total meeting time in minutes")
    total_hours: float = Field(default=0.0, description="Total meeting time in hours")


class EmployeeStatistics(BaseModel):
    """Statistics for an employee."""
    
    user_id: UUID
    user_name: Optional[str] = None
    user_email: str
    department_id: Optional[UUID] = None
    department_name: Optional[str] = None
    total_meetings: int = Field(default=0, description="Total number of meetings")
    total_minutes: int = Field(default=0, description="Total meeting time in minutes")
    total_hours: float = Field(default=0.0, description="Total meeting time in hours")


class RoomStatistics(BaseModel):
    """Statistics for a room."""
    
    room_id: UUID
    room_name: str
    total_bookings: int = Field(default=0, description="Total number of bookings")
    total_minutes: int = Field(default=0, description="Total booked time in minutes")
    total_hours: float = Field(default=0.0, description="Total booked time in hours")
    free_time_minutes: int = Field(default=0, description="Free time in minutes")
    free_time_hours: float = Field(default=0.0, description="Free time in hours")
    utilization_percent: float = Field(default=0.0, description="Room utilization percentage")


class StatisticsResponse(BaseModel):
    """Response with statistics."""
    
    from_date: datetime
    to_date: datetime
    department_stats: list[DepartmentStatistics] = Field(default_factory=list)
    employee_stats: list[EmployeeStatistics] = Field(default_factory=list)
    room_stats: list[RoomStatistics] = Field(default_factory=list)

