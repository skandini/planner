from __future__ import annotations

from typing import Generic, TypeVar, Optional
from pydantic import BaseModel, Field

T = TypeVar("T")


class PaginationParams(BaseModel):
    """Параметры пагинации для запросов."""

    page: int = Field(default=1, ge=1, description="Номер страницы (начиная с 1)")
    page_size: int = Field(
        default=50, ge=1, le=100, description="Количество элементов на странице"
    )

    @property
    def skip(self) -> int:
        """Вычисляет количество элементов для пропуска."""
        return (self.page - 1) * self.page_size

    @property
    def limit(self) -> int:
        """Возвращает лимит элементов."""
        return self.page_size


class PaginatedResponse(BaseModel, Generic[T]):
    """Ответ с пагинацией."""

    items: list[T] = Field(description="Список элементов на текущей странице")
    total: int = Field(description="Общее количество элементов")
    page: int = Field(description="Текущая страница")
    page_size: int = Field(description="Размер страницы")
    total_pages: int = Field(description="Общее количество страниц")

    @classmethod
    def create(
        cls,
        items: list[T],
        total: int,
        page: int,
        page_size: int,
    ) -> PaginatedResponse[T]:
        """Создает ответ с пагинацией."""
        total_pages = (total + page_size - 1) // page_size if total > 0 else 0
        return cls(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
        )

