from pydantic import BaseModel
from typing import Optional
from enum import Enum

class FlightType(str, Enum):
    SMS = "SMS"
    DMS = "DMS"

class DmsRole(str, Enum):
    BUSINESS = "BUSINESS"
    ECONOMY = "ECONOMY"

class Flight(BaseModel):
    id: str
    flightNo: str
    route: str
    origin: Optional[str] = None
    dest: Optional[str] = None
    acType: str
    type: FlightType
    dmsRole: Optional[DmsRole] = None
    dmsPairKey: Optional[str] = None
    flightDate: Optional[str] = None  # Дата рейса в формате YYYY-MM-DD
    stdMin: int  # Время в минутах от 00:00 базового дня
    kitchenOut: int
    serviceStart: int
    serviceEnd: int
    unloadEnd: int
    loadStart: int
    loadEnd: int
    vehicleId: str = ""
    chainId: str = ""
    cancelled: bool = False
