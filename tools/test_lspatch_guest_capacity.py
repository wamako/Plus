import unittest
from run_lspatch_smoke import guest_capacity, settle_guest

class Guest:
    def __init__(self, cpu="4", memory="3900000"):
        self.cpu, self.memory = cpu, memory
    def shell(self, *args, **kwargs):
        return self.cpu if args[0] == "getconf" else "MemTotal: " + self.memory + " kB\n"

class CapacityTests(unittest.TestCase):
    def test_guest_capacity_cannot_be_inferred_from_requested_resources(self):
        self.assertEqual(guest_capacity(Guest(), 4, 4096)["guest_vcpu_count"], 4)
        for guest in (Guest(cpu="2"), Guest(cpu="private"), Guest(memory="2000000")):
            with self.assertRaises(RuntimeError):
                guest_capacity(guest, 4, 4096)

    def test_idle_barrier_failure_cannot_be_a_successful_preparation(self):
        class Busy:
            calls = 0
            def shell(self, *args, **kwargs):
                self.calls += 1
                if self.calls == 2:
                    raise RuntimeError("busy")
                return "Success"
        busy = Busy()
        with self.assertRaises(RuntimeError):
            settle_guest(busy)
        self.assertEqual(busy.calls, 2)
