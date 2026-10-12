using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Rendering; 
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Authorization;
using ProvMeet.Data;
using ProvMeet.Models;
using System.Collections.Generic;
using System;
using System.Linq;
using System.Threading.Tasks;

namespace ProvMeet.Controllers
{
    [Authorize]
    public class EventsController : Controller
    {
        private readonly ApplicationDbContext _context;

        public EventsController(ApplicationDbContext context)
        {
            _context = context;
        }

        // Helper method to safely extract the CoordinatorId regardless of how the login generated the claims
        private int? GetCurrentCoordinatorId()
        {
            var claimValue = User.FindFirst("CoordinatorId")?.Value 
                ?? User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value
                ?? User.FindFirst("Id")?.Value;

            if (int.TryParse(claimValue, out int parsedId))
            {
                return parsedId;
            }
            return null;
        }

        [AllowAnonymous]
        public async Task<IActionResult> Index()
        {
            var events = await _context.Events.OrderBy(e => e.Division).ThenBy(e => e.SportName).ThenBy(e => e.Title).ToListAsync();
            ViewBag.Teams = await _context.Teams.OrderBy(t => t.Name).ToListAsync();
            return View(events);
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> UpdateResult(int eventId, int? goldTeamId, int? silverTeamId, int? bronzeTeamId)
        {
            var ev = await _context.Events.FindAsync(eventId);
            if (ev == null) return NotFound();

            bool isAdmin = User.IsInRole("Admin");
            int? currentCoordinatorId = GetCurrentCoordinatorId();

            if (!isAdmin && ev.CoordinatorId != currentCoordinatorId)
            {
                return Forbid();
            }

            ev.GoldTeamId = goldTeamId;
            ev.SilverTeamId = silverTeamId;
            ev.BronzeTeamId = bronzeTeamId;
            ev.Status = (goldTeamId != null || silverTeamId != null || bronzeTeamId != null) ? "Completed" : "Pending";
            ev.UpdatedAt = DateTime.UtcNow;

            _context.Update(ev);
            await _context.SaveChangesAsync();
            return RedirectToAction(nameof(Index));
        }

        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> Create()
        {
            ViewBag.Teams = await _context.Teams.ToListAsync();
            ViewBag.Coordinators = new SelectList(await _context.Coordinators.OrderBy(c => c.FullName).ToListAsync(), "Id", "FullName");
            return View();
        }

        private void ValidateSportCategory(Event ev)
        {
            if (ev.SportCategory is not ("Boys" or "Girls" or "Mixed"))
            {
                ModelState.AddModelError(nameof(Event.SportCategory), "Select Boys, Girls, or Mixed.");
            }
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> Create([Bind("Title,SportName,SportCategory,EventCategory,Division,Status,CoordinatorId")] Event ev)
        {
            ValidateSportCategory(ev);
            if (ModelState.IsValid)
            {
                ev.CreatedAt = DateTime.UtcNow;
                ev.UpdatedAt = DateTime.UtcNow;
                
                _context.Add(ev);
                await _context.SaveChangesAsync();
                return RedirectToAction(nameof(ManageEvents));
            }
            
            ViewBag.Coordinators = new SelectList(await _context.Coordinators.OrderBy(c => c.FullName).ToListAsync(), "Id", "FullName", ev.CoordinatorId);
            return View(ev);
        }

        [HttpGet]
        public async Task<IActionResult> Edit(int id)
        {
            var ev = await _context.Events.FindAsync(id);
            if (ev == null) return NotFound();

            bool isAdmin = User.IsInRole("Admin");
            int? currentCoordinatorId = GetCurrentCoordinatorId();

            if (!isAdmin && ev.CoordinatorId != currentCoordinatorId)
            {
                return Forbid();
            }

            ViewBag.Teams = await _context.Teams.ToListAsync();
            ViewBag.Coordinators = new SelectList(await _context.Coordinators.OrderBy(c => c.FullName).ToListAsync(), "Id", "FullName", ev.CoordinatorId);
            
            return View(ev);
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> Edit(int id, [Bind("Id,Title,SportName,SportCategory,EventCategory,Division,CoordinatorId,Status")] Event ev)
        {
            if (id != ev.Id) return NotFound();

            ValidateSportCategory(ev);
            if (ModelState.IsValid)
            {
                var existingEvent = await _context.Events.FindAsync(id);
                if (existingEvent == null) return NotFound();

                existingEvent.Title = ev.Title;
                existingEvent.SportName = ev.SportName;
                existingEvent.SportCategory = ev.SportCategory;
                existingEvent.EventCategory = ev.EventCategory;
                existingEvent.Division = ev.Division;
                existingEvent.CoordinatorId = ev.CoordinatorId;
                existingEvent.Status = ev.Status;
                existingEvent.UpdatedAt = DateTime.UtcNow;

                await _context.SaveChangesAsync();
                return RedirectToAction(nameof(ManageEvents));
            }
            
            ViewBag.Teams = await _context.Teams.ToListAsync();
            ViewBag.Coordinators = new SelectList(await _context.Coordinators.OrderBy(c => c.FullName).ToListAsync(), "Id", "FullName", ev.CoordinatorId);
            
            return View(ev);
        }

        [HttpPost, ActionName("Delete")]
        [ValidateAntiForgeryToken]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> DeleteConfirmed(int id)
        {
            var ev = await _context.Events.FindAsync(id);
            if (ev != null)
            {
                _context.Events.Remove(ev);
                await _context.SaveChangesAsync();
            }
            return RedirectToAction(nameof(ManageEvents));
        }

        [HttpGet]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> ManageEvents()
        {
            var events = await _context.Events.OrderBy(e => e.Division).ThenBy(e => e.SportName).ThenBy(e => e.Title).ToListAsync();
            ViewBag.Coordinators = await _context.Coordinators.OrderBy(c => c.FullName).ToListAsync();
            return View(events);
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> UpdateAllEventCoordinators(Dictionary<int, int?> assignments)
        {
            if (assignments is { Count: > 0 })
            {
                var eventIds = assignments.Keys.ToList();
                var events = await _context.Events
                    .Where(e => eventIds.Contains(e.Id))
                    .ToListAsync();

                foreach (var ev in events)
                {
                    if (assignments.TryGetValue(ev.Id, out var coordinatorId)
                        && ev.CoordinatorId != coordinatorId)
                    {
                        ev.CoordinatorId = coordinatorId;
                        ev.UpdatedAt = DateTime.UtcNow;
                    }
                }

                await _context.SaveChangesAsync();
                TempData["SuccessMessage"] = "Coordinator assignments saved successfully.";
            }
            return RedirectToAction(nameof(ManageEvents));
        }

        [HttpGet]
        [AllowAnonymous]
        public async Task<IActionResult> SubmitResults(int id, string? returnUrl = null)
        {
            var ev = await _context.Events.FindAsync(id);
            if (ev == null) return NotFound();

            ViewBag.Teams = await _context.Teams.OrderBy(t => t.Name).ToListAsync();
            ViewBag.ReturnUrl = returnUrl;
            if (User.Identity?.IsAuthenticated == true && (User.IsInRole("Admin") || ev.CoordinatorId == GetCurrentCoordinatorId()))
            {
                var winners = await _context.Events.AsNoTracking()
                    .Select(e => new { e.GoldWinnerName, e.SilverWinnerName, e.BronzeWinnerName }).ToListAsync();
                ViewBag.WinnerNames = winners.SelectMany(e => new[] { e.GoldWinnerName, e.SilverWinnerName, e.BronzeWinnerName })
                    .SelectMany(ProvMeet.Services.PlayerMedals.Names)
                    .Distinct(StringComparer.OrdinalIgnoreCase).OrderBy(name => name).ToList();
            }
            return View(ev);
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> SubmitResults(Event model, string? returnUrl = null)
        {
            var eventToUpdate = await _context.Events.FindAsync(model.Id);
            if (eventToUpdate == null) return NotFound();

            bool isAdmin = User.IsInRole("Admin");
            int? currentCoordinatorId = GetCurrentCoordinatorId();

            if (!isAdmin && eventToUpdate.CoordinatorId != currentCoordinatorId)
            {
                return Forbid();
            }

            var allTeams = await _context.Teams.ToListAsync();

            string ToProperCase(string input)
            {
                if (string.IsNullOrWhiteSpace(input)) return string.Empty;
                return System.Globalization.CultureInfo.CurrentCulture.TextInfo.ToTitleCase(input.Trim().ToLowerInvariant());
            }

            string FormatNamesToProperCase(string? names)
            {
                if (string.IsNullOrWhiteSpace(names)) return string.Empty;
                var lines = names.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
                return string.Join(Environment.NewLine, lines.Select(l => ToProperCase(l)).Where(l => !string.IsNullOrEmpty(l)));
            }

            eventToUpdate.GoldTeamId = model.GoldTeamId;
            eventToUpdate.SilverTeamId = model.SilverTeamId;
            eventToUpdate.BronzeTeamId = model.BronzeTeamId;
            eventToUpdate.GoldWinnerName = string.IsNullOrWhiteSpace(model.GoldWinnerName) ? null : FormatNamesToProperCase(model.GoldWinnerName);
            eventToUpdate.SilverWinnerName = string.IsNullOrWhiteSpace(model.SilverWinnerName) ? null : FormatNamesToProperCase(model.SilverWinnerName);
            eventToUpdate.BronzeWinnerName = string.IsNullOrWhiteSpace(model.BronzeWinnerName) ? null : FormatNamesToProperCase(model.BronzeWinnerName);
            eventToUpdate.LastUpdatedBy = User.FindFirst("FullName")?.Value ?? User.Identity?.Name;
            eventToUpdate.UpdatedAt = DateTime.UtcNow;
            eventToUpdate.Status = "Completed";

            // Automatically determine gender based on event title ("boys" -> "M", "girls" -> "W", otherwise blank)
            string autoGender = "";
            if (!string.IsNullOrEmpty(eventToUpdate.Title))
            {
                if (eventToUpdate.Title.Contains("boys", StringComparison.OrdinalIgnoreCase))
                {
                    autoGender = "M";
                }
                else if (eventToUpdate.Title.Contains("girls", StringComparison.OrdinalIgnoreCase))
                {
                    autoGender = "W";
                }
            }

            async Task ProcessQualifiers(long? teamId, string winnerNames, string role)
            {
                if (teamId == null || string.IsNullOrWhiteSpace(winnerNames)) return;

                var teamName = allTeams.FirstOrDefault(t => t.Id == teamId)?.Name ?? "Unknown Area";
                var names = winnerNames.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);

                foreach (var name in names)
                {
                    var cleanName = ToProperCase(name);
                    if (string.IsNullOrEmpty(cleanName)) continue;

                    var cleanNameLower = cleanName.ToLower();
                    var existing = await _context.EventQualifiers
                        .FirstOrDefaultAsync(q => q.EventId == model.Id && 
                            (q.ParticipantName == cleanName || q.ParticipantName.ToLower() == cleanNameLower));

                    if (existing != null)
                    {
                        existing.ParticipantName = cleanName;
                        existing.Team = teamName; // UPDATED FROM SchoolName TO Team
                        existing.Role = role;
                        existing.Gender = autoGender;
                        existing.UpdatedAt = DateTime.UtcNow;
                    }
                    else
                    {
                        _context.EventQualifiers.Add(new EventQualifier
                        {
                            Id = Guid.NewGuid(),
                            EventId = model.Id,
                            ParticipantName = cleanName,
                            Team = teamName, // UPDATED FROM SchoolName TO Team
                            Role = role,
                            Gender = autoGender,
                            UpdatedAt = DateTime.UtcNow
                        });
                    }
                }
            }

            // Only the gold winner is added to prov_qualifiers.
            await ProcessQualifiers(model.GoldTeamId, model.GoldWinnerName ?? string.Empty, "Athlete");

            await _context.SaveChangesAsync();

            TempData["SuccessMessage"] = "Official results published successfully.";
            return RedirectToAction(nameof(SubmitResults), new { id = model.Id, returnUrl = returnUrl });
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> ClearResults(int id, string? returnUrl = null) 
        {
            var eventToClear = await _context.Events.FindAsync(id);
            if (eventToClear == null) return NotFound();

            bool isAdmin = User.IsInRole("Admin");
            int? currentCoordinatorId = GetCurrentCoordinatorId();

            if (!isAdmin && eventToClear.CoordinatorId != currentCoordinatorId)
            {
                return Forbid();
            }

            eventToClear.GoldTeamId = null;
            eventToClear.SilverTeamId = null;
            eventToClear.BronzeTeamId = null;
            eventToClear.GoldWinnerName = null;
            eventToClear.SilverWinnerName = null;
            eventToClear.BronzeWinnerName = null;
            eventToClear.Status = "Pending"; 
            eventToClear.LastUpdatedBy = User.FindFirst("FullName")?.Value ?? User.Identity?.Name;
            eventToClear.UpdatedAt = DateTime.UtcNow;

            var qualifiers = await _context.EventQualifiers
                .Where(q => q.EventId == id)
                .ToListAsync();
            
            if (qualifiers.Any())
            {
                _context.EventQualifiers.RemoveRange(qualifiers);
            }

            await _context.SaveChangesAsync();

            TempData["SuccessMessage"] = "Event data cleared successfully.";
            return RedirectToAction(nameof(SubmitResults), new { id = id, returnUrl = returnUrl });
        }
    }
}
