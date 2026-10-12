using ProvMeet.Controllers;
using ProvMeet.Data;
using ProvMeet.Models;
using ProvMeet.Security;
using ProvMeet.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ViewFeatures;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

void Check(bool condition, string label) { if (!condition) throw new Exception(label); Console.WriteLine("PASS: " + label); }
var password = "Test-only! password";
var hashed = CoordinatorPasswords.Hash(password);
Check(hashed.Length <= 100 && hashed != password, "hash fits existing column");
Check(CoordinatorPasswords.Hash(password) != hashed, "independent random salts");
Check(CoordinatorPasswords.Verify(hashed, password, out var legacy) && !legacy, "hashed login");
Check(!CoordinatorPasswords.Verify(hashed, "wrong", out _), "incorrect password rejected");
Check(CoordinatorPasswords.Verify(password, password, out legacy) && legacy, "legacy login migration recognized");
Check(!CoordinatorPasswords.Verify("$pbkdf2-sha256$600000$bad$bad", password, out _), "malformed hash rejected");
Check(new Coordinator { Password = CoordinatorPasswords.Hash("coordinator") }.NeedsPasswordChange, "hashed default still requires change");

var categoryEvent = new Event
{
    Id = 99, Title = "Sample Event", SportName = "Athletics",
    SportCategory = "Girls", EventCategory = "Individual", Division = "Secondary",
    GoldTeamId = 1, GoldWinnerName = "Sample Athlete"
};
Check(PlayerMedals.Category(categoryEvent) == "Girls", "participant category comes from sport_category");
var categoryEntry = PlayerMedals.Build(new[] { categoryEvent }, new[] { new Team { Id = 1, Name = "CD 1" } }).Single();
Check(categoryEntry.Category == "Girls" && categoryEntry.SportType == "Individual",
    "player reports keep category and event type in their correct columns");

using var connection = new SqliteConnection("Data Source=:memory:");
connection.Open();
var options = new DbContextOptionsBuilder<ApplicationDbContext>().UseSqlite(connection).Options;
using var db = new ApplicationDbContext(options);
db.Database.EnsureCreated();
db.Events.AddRange(new Event { Id = 1, Title = "Assigned", CoordinatorId = 10 }, new Event { Id = 2, Title = "Other", CoordinatorId = 20 });
var own = new EventQualifier { Id = Guid.NewGuid(), EventId = 1, ParticipantName = "Own" };
var other = new EventQualifier { Id = Guid.NewGuid(), EventId = 2, ParticipantName = "Other" };
db.EventQualifiers.AddRange(own, other);
db.Coordinators.Add(new Coordinator { Id = 10, Username = "test", FullName = "Test", Password = "coordinator" });
db.SaveChanges();
void SetUser(Controller controller, string role = "Coordinator", string? id = "10") {
    var claims = new List<Claim> { new(ClaimTypes.Role, role) };
    if (id != null) claims.Add(new Claim("CoordinatorId", id));
    var context = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity(claims, "Test")) };
    controller.ControllerContext = new ControllerContext { HttpContext = context };
    controller.TempData = new TempDataDictionary(context, new MemoryTempData());
}
var eventAdmin = new EventsController(db);
SetUser(eventAdmin, "Admin");
Check(await eventAdmin.Create(new Event
{
    Title = "Category Mapping Check", SportName = "Athletics", SportCategory = "Girls",
    EventCategory = "Individual", Division = "Secondary", Status = "Pending"
}) is RedirectToActionResult, "add event accepts category and type in their intended fields");
var createdEvent = db.Events.Single(e => e.Title == "Category Mapping Check");
Check(createdEvent.SportCategory == "Girls" && createdEvent.EventCategory == "Individual",
    "add event saves category to sport_category and type to event_category");
var delegation = new DelegationController(db);
SetUser(delegation);
Check(await delegation.SaveQualifier(new EventQualifier { Id = other.Id, EventId = 1, ParticipantName = "Attack" }) is NotFoundObjectResult, "cross-event ID substitution rejected");
Check(db.EventQualifiers.AsNoTracking().Single(q => q.Id == other.Id).ParticipantName == "Other", "foreign participant unchanged");
Check(await delegation.SaveQualifier(new EventQualifier { Id = own.Id, EventId = 1, ParticipantName = "Updated" }) is RedirectToActionResult, "assigned participant edit succeeds");
Check(db.EventQualifiers.AsNoTracking().Single(q => q.Id == own.Id).ParticipantName == "Updated", "assigned edit persisted");
SetUser(delegation, id: null);
Check(await delegation.SaveQualifier(new EventQualifier { EventId = 1, ParticipantName = "Attack" }) is ForbidResult, "missing coordinator claim denied");

var accounts = new AccountController(db);
var home = new HomeController(db);
SetUser(home);
Check(await home.SaveQualifierModal(new EventQualifier { Id = other.Id, EventId = 1, ParticipantName = "Attack" }) is ForbidResult, "modal checks original participant event");
Check(await home.SaveQualifierModal(new EventQualifier { Id = own.Id, EventId = 2, ParticipantName = "Attack" }) is ForbidResult, "modal checks destination event");
Check(await home.BulkSaveQualifiers(new List<EventQualifier> { new() { Id = own.Id, EventId = 1, ParticipantName = "Partial attack" }, new() { Id = other.Id, EventId = 1, ParticipantName = "Attack" } }) is ForbidResult, "mixed-authority bulk edit rejected atomically");
Check(db.EventQualifiers.AsNoTracking().Single(q => q.Id == own.Id).ParticipantName == "Updated", "bulk rejection does not partially save");
Check(await home.BulkDeleteQualifiers(new List<Guid> { own.Id, other.Id }) is ForbidResult, "bulk deletion cannot include another coordinator's participant");
Check(await home.DeleteQualifier(other.Id) is ForbidResult, "single deletion checks ownership");
SetUser(home, "Admin", id: null);
Check(await home.SaveQualifierModal(new EventQualifier { Id = other.Id, EventId = 2, ParticipantName = "Admin update" }) is RedirectToActionResult, "admin can edit any event without an assignment claim");
Check(await home.SaveQualifierModal(new EventQualifier { Id = own.Id, EventId = 1, ParticipantName = "Assigned admin update" }) is RedirectToActionResult, "admin can edit an assigned event participant");
SetUser(delegation, "Admin", id: null);
Check(await delegation.SaveQualifier(new EventQualifier { Id = other.Id, EventId = 2, ParticipantName = "Admin edit" }) is RedirectToActionResult, "delegation allows global admin edits");
Check(await delegation.AddRecordedWinners(2, new List<string>()) is RedirectToActionResult, "admin can import participants into any event");
Check(await delegation.BulkDelete(new List<Guid> { other.Id }, 2) is RedirectToActionResult, "admin can bulk delete unassigned participants");
Check(await home.DeleteQualifier(own.Id) is RedirectToActionResult, "admin can delete any event participant");
SetUser(accounts);
Check(await accounts.Login("test", "coordinator") is RedirectToActionResult, "legacy default login enters password-change flow");
var upgraded = db.Coordinators.Single(c => c.Id == 10).Password;
Check(CoordinatorPasswords.Verify(upgraded, "coordinator", out legacy) && !legacy, "legacy password replaced in database");
accounts.TempData["Username"] = "test";
await accounts.ChangePassword(password, password);
Check(CoordinatorPasswords.Verify(db.Coordinators.Single(c => c.Id == 10).Password, password, out legacy) && !legacy, "changed password stored hashed");
var admins = new CoordinatorsController(db);
SetUser(admins, "Admin");
await admins.Edit(10, new Coordinator { Id = 10, Username = "test", FullName = "Updated", Password = "" });
Check(CoordinatorPasswords.Verify(db.Coordinators.Single(c => c.Id == 10).Password, password, out _), "blank admin password edit preserves credentials");
await admins.Edit(10, new Coordinator { Id = 10, Username = "test", FullName = "Updated", Password = "Reset password!" });
Check(CoordinatorPasswords.Verify(db.Coordinators.Single(c => c.Id == 10).Password, "Reset password!", out legacy) && !legacy, "administrator password reset is hashed");
await admins.Create(new Coordinator { Username = "new", FullName = "New", Password = "coordinator" });
Check(CoordinatorPasswords.Verify(db.Coordinators.Single(c => c.Username == "new").Password, "coordinator", out legacy) && !legacy, "new account default is hashed");
Console.WriteLine("Security regression checks passed; only an in-memory database was used.");

sealed class MemoryTempData : ITempDataProvider {
    public IDictionary<string, object> LoadTempData(HttpContext context) => new Dictionary<string, object>();
    public void SaveTempData(HttpContext context, IDictionary<string, object> values) { }
}
