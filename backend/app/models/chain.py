from pydantic import BaseModel

class ChainWin(BaseModel):
    chain_id: str
    machine_id: str
    start: int
    end: int
