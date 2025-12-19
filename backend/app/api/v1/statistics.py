from __future__ import annotations

from datetime import datetime, timedelta
from typing import List

from fastapi import APIRouter, Query
from sqlmodel import func, select

from app.db import SessionDep
from app.models import Department, Event, EventParticipant, Room, User
from app.schemas.statistics import (
    DepartmentStatistics,
    EmployeeStatistics,
    RoomStatistics,
    StatisticsResponse,
)

router = APIRouter()


@router.get("/", response_model=StatisticsResponse, summary="Get statistics")
def get_statistics(
    from_date: datetime = Query(
        ...,
        description="Start date for statistics (ISO format)",
    ),
    to_date: datetime = Query(
        ...,
        description="End date for statistics (ISO format)",
    ),
    session: SessionDep = ...,
) -> StatisticsResponse:
    """Get statistics for departments and rooms."""
    
    # Get all events in the date range
    events_statement = (
        select(Event)
        .where(Event.starts_at >= from_date)
        .where(Event.ends_at <= to_date)
        .where(Event.status == "confirmed")
    )
    events = session.exec(events_statement).all()
    
    # Calculate total time range in minutes
    total_minutes = int((to_date - from_date).total_seconds() / 60)
    
    # Statistics by department
    department_stats_map: dict[str, DepartmentStatistics] = {}
    
    for event in events:
        # Get participants for this event
        participants_statement = select(EventParticipant).where(
            EventParticipant.event_id == event.id
        )
        participants = session.exec(participants_statement).all()
        
        # Calculate event duration in minutes
        event_duration = int((event.ends_at - event.starts_at).total_seconds() / 60)
        
        # Group by department
        for participant in participants:
            if participant.user_id:
                user = session.get(User, participant.user_id)
                if user and user.department_id:
                    dept = session.get(Department, user.department_id)
                    if dept:
                        dept_key = str(dept.id)
                        if dept_key not in department_stats_map:
                            department_stats_map[dept_key] = DepartmentStatistics(
                                department_id=dept.id,
                                department_name=dept.name,
                            )
                        department_stats_map[dept_key].total_meetings += 1
                        department_stats_map[dept_key].total_minutes += event_duration
    
    # Convert minutes to hours
    department_stats = list(department_stats_map.values())
    for stat in department_stats:
        stat.total_hours = round(stat.total_minutes / 60, 2)
    
    # Sort by total minutes descending
    department_stats.sort(key=lambda x: x.total_minutes, reverse=True)
    
    # Statistics by employee
    employee_stats_map: dict[str, EmployeeStatistics] = {}
    
    for event in events:
        # Get participants for this event
        participants_statement = select(EventParticipant).where(
            EventParticipant.event_id == event.id
        )
        participants = session.exec(participants_statement).all()
        
        # Calculate event duration in minutes
        event_duration = int((event.ends_at - event.starts_at).total_seconds() / 60)
        
        # Group by employee
        for participant in participants:
            if participant.user_id:
                user = session.get(User, participant.user_id)
                if user:
                    user_key = str(user.id)
                    if user_key not in employee_stats_map:
                        department_name = None
                        if user.department_id:
                            dept = session.get(Department, user.department_id)
                            if dept:
                                department_name = dept.name
                        
                        employee_stats_map[user_key] = EmployeeStatistics(
                            user_id=user.id,
                            user_name=user.full_name,
                            user_email=user.email,
                            department_id=user.department_id,
                            department_name=department_name,
                        )
                    employee_stats_map[user_key].total_meetings += 1
                    employee_stats_map[user_key].total_minutes += event_duration
    
    # Convert minutes to hours
    employee_stats = list(employee_stats_map.values())
    for stat in employee_stats:
        stat.total_hours = round(stat.total_minutes / 60, 2)
    
    # Sort by total minutes descending
    employee_stats.sort(key=lambda x: x.total_minutes, reverse=True)
    
    # Statistics by room
    room_stats_map: dict[str, RoomStatistics] = {}
    
    # Get all rooms
    rooms_statement = select(Room).where(Room.is_active == True)
    all_rooms = session.exec(rooms_statement).all()
    
    for room in all_rooms:
        room_key = str(room.id)
        room_stats_map[room_key] = RoomStatistics(
            room_id=room.id,
            room_name=room.name,
        )
    
    # Calculate room usage
    for event in events:
        if event.room_id:
            room_key = str(event.room_id)
            if room_key in room_stats_map:
                event_duration = int(
                    (event.ends_at - event.starts_at).total_seconds() / 60
                )
                room_stats_map[room_key].total_bookings += 1
                room_stats_map[room_key].total_minutes += event_duration
    
    # Calculate free time and utilization
    room_stats = list(room_stats_map.values())
    for stat in room_stats:
        stat.total_hours = round(stat.total_minutes / 60, 2)
        stat.free_time_minutes = max(0, total_minutes - stat.total_minutes)
        stat.free_time_hours = round(stat.free_time_minutes / 60, 2)
        if total_minutes > 0:
            stat.utilization_percent = round(
                (stat.total_minutes / total_minutes) * 100, 2
            )
    
    # Sort rooms by free time (most free first)
    room_stats.sort(key=lambda x: x.free_time_minutes, reverse=True)
    
    return StatisticsResponse(
        from_date=from_date,
        to_date=to_date,
        department_stats=department_stats,
        employee_stats=employee_stats,
        room_stats=room_stats,
    )

