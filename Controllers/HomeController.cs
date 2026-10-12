using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Rendering;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Authorization;
using ProvMeet.Data;
using ProvMeet.Models;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace ProvMeet.Controllers
{
    public class HomeController : Controller
    {
        private readonly ApplicationDbContext _context;

        public HomeController(ApplicationDbContext context)
        {
            _context = context;
        }

        public async Task<IActionResult> Index()
        {
            var tallies = await _context.GetTeamStandings()
                .OrderByDescending(t => t.Gold)
                .ThenByDescending(t => t.Silver)
                .ThenByDescending(t => t.Bronze)
                .ToListAsync();

            var recentResults = await _context.Events
                .Where(g => g.Status == "Completed"
                    && (g.GoldTeamId.HasValue || g.SilverTeamId.HasValue || g.BronzeTeamId.HasValue))
                .OrderByDescending(g => g.UpdatedAt)
                .ToListAsync();

            var totalEvents = await _context.Events.CountAsync(e =>
                e.Status != "Completed"
                || e.GoldTeamId.HasValue
                || e.SilverTeamId.HasValue
                || e.BronzeTeamId.HasValue);

            ViewBag.RecentResults = recentResults;
            ViewBag.TotalEvents = totalEvents;

            return View(tallies);
        }

        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> GeneralOfficialReport()
        {
            var medalTallies = await _context.GetTeamStandings()
                .OrderByDescending(m => m.Gold)
                .ThenByDescending(m => m.Silver)
                .ThenByDescending(m => m.Bronze)
                .ToListAsync();

            return View(medalTallies);
        }

        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> AllEventsResultsReport(List<string> sportsName, List<int> eventId, List<string> division, List<int> schoolId)
        {
            var query = _context.Events.AsNoTracking().AsQueryable();

            if (sportsName != null && sportsName.Any())
            {
                query = query.Where(e => e.SportName != null && sportsName.Contains(e.SportName));
            }

            if (eventId != null && eventId.Any())
            {
                query = query.Where(e => eventId.Contains(e.Id));
            }

            if (division != null && division.Any())
            {
                query = query.Where(e => e.Division != null && division.Contains(e.Division));
            }

            if (schoolId != null && schoolId.Any())
            {
                query = query.Where(e => 
                    (e.GoldTeamId.HasValue && schoolId.Contains(e.GoldTeamId.Value)) || 
                    (e.SilverTeamId.HasValue && schoolId.Contains(e.SilverTeamId.Value)) || 
                    (e.BronzeTeamId.HasValue && schoolId.Contains(e.BronzeTeamId.Value)));
            }

            var resultList = await query
                .OrderBy(e => e.Title)
                .ToListAsync();

            // Populate filter dropdowns with AsNoTracking for ultra-fast loading
            ViewBag.SportsList = await _context.Events.AsNoTracking()
                .Where(e => !string.IsNullOrEmpty(e.SportName))
                .Select(e => e.SportName)
                .Distinct()
                .OrderBy(s => s)
                .Select(s => new SelectListItem { Value = s, Text = s })
                .ToListAsync();

            ViewBag.EventsList = await _context.Events.AsNoTracking()
                .OrderBy(e => e.Title)
                .Select(e => new SelectListItem { Value = e.Id.ToString(), Text = e.Title })
                .Distinct()
                .ToListAsync();

            ViewBag.DivisionsList = (await _context.Events.AsNoTracking()
                .Where(e => !string.IsNullOrEmpty(e.Division))
                .Select(e => e.Division)
                .Distinct()
                .ToListAsync())
                .Union(new[] { "Elementary", "Secondary", "Paragames" })
                .OrderBy(d => d)
                .Select(d => new SelectListItem { Value = d, Text = d })
                .ToList();

            // Schools list for dropdown and name resolution
            ViewBag.SchoolsList = await _context.Teams.AsNoTracking()
                .OrderBy(t => t.Name)
                .ToListAsync();

            return View(resultList);
        }

        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> PendingEventsReport(List<string> sportsName, List<int> eventId, List<string> division)
        {
            var query = _context.Events.AsNoTracking().AsQueryable();

            // Published events are complete even when no medals were awarded.
            query = query.Where(e => e.Status != "Completed");

            if (sportsName != null && sportsName.Any())
            {
                query = query.Where(e => e.SportName != null && sportsName.Contains(e.SportName));
            }

            if (eventId != null && eventId.Any())
            {
                query = query.Where(e => eventId.Contains(e.Id));
            }

            if (division != null && division.Any())
            {
                query = query.Where(e => e.Division != null && division.Contains(e.Division));
            }

            var resultList = await query
                .OrderBy(e => e.Title)
                .ToListAsync();

            ViewBag.SportsList = await _context.Events.AsNoTracking()
                .Where(e => !string.IsNullOrEmpty(e.SportName))
                .Select(e => e.SportName)
                .Distinct()
                .OrderBy(s => s)
                .Select(s => new SelectListItem { Value = s, Text = s })
                .ToListAsync();

            ViewBag.EventsList = await _context.Events.AsNoTracking()
                .OrderBy(e => e.Title)
                .Select(e => new SelectListItem { Value = e.Id.ToString(), Text = e.Title })
                .Distinct()
                .ToListAsync();

            ViewBag.DivisionsList = (await _context.Events.AsNoTracking()
                .Where(e => !string.IsNullOrEmpty(e.Division))
                .Select(e => e.Division)
                .Distinct()
                .ToListAsync())
                .Union(new[] { "Elementary", "Secondary", "Paragames" })
                .OrderBy(d => d)
                .Select(d => new SelectListItem { Value = d, Text = d })
                .ToList();

            ViewBag.SchoolsList = await _context.Teams.AsNoTracking()
                .OrderBy(t => t.Name)
                .ToListAsync();

            return View(resultList);
        }

        [Authorize(Roles = "Admin,Coordinator")]
        public async Task<IActionResult> DistrictQualifierReport(List<string> sportsName, List<int> eventId, List<string> division, List<string> district)
        {
            var joinedQuery = from q in _context.EventQualifiers
                              join e in _context.Events on q.EventId equals e.Id
                              select new { Qualifier = q, Event = e };

            if (sportsName != null && sportsName.Any())
            {
                joinedQuery = joinedQuery.Where(x => x.Event.SportName != null && sportsName.Contains(x.Event.SportName));
            }

            if (eventId != null && eventId.Any())
            {
                joinedQuery = joinedQuery.Where(x => eventId.Contains(x.Event.Id));
            }

            if (division != null && division.Any())
            {
                joinedQuery = joinedQuery.Where(x => division.Contains(x.Event.Division));
            }

            if (district != null && district.Any())
            {
                joinedQuery = joinedQuery.Where(x => x.Qualifier.Team != null && district.Contains(x.Qualifier.Team));
            }

            var rawList = await joinedQuery.ToListAsync();

            var sortedQualifiers = rawList
                .OrderBy(x => x.Event.SportName ?? "")
                .ThenBy(x => x.Event.Title ?? "")
                .ThenBy(x => {
                    string r = x.Qualifier.Role?.ToLower() ?? "";
                    if (r.Contains("athlete")) return 1;
                    if (r.Contains("coach")) return 2;
                    if (r.Contains("chaperon") || r.Contains("chaperone")) return 3;
                    return 4;
                })
                .ThenBy(x => x.Qualifier.ParticipantName ?? "")
                .Select(x => x.Qualifier)
                .ToList();

            ViewBag.SportsList = await _context.Events
                .Where(e => !string.IsNullOrEmpty(e.SportName))
                .Select(e => e.SportName)
                .Distinct()
                .OrderBy(s => s)
                .Select(s => new SelectListItem { Value = s, Text = s })
                .ToListAsync();

            ViewBag.EventsList = await _context.Events
                .OrderBy(e => e.Title)
                .Select(e => new SelectListItem { Value = e.Id.ToString(), Text = e.Title })
                .Distinct()
                .ToListAsync();

            ViewBag.DivisionsList = (await _context.Events
                .Where(e => !string.IsNullOrEmpty(e.Division))
                .Select(e => e.Division)
                .Distinct()
                .ToListAsync())
                .Union(new[] { "Elementary", "Secondary", "Paragames" })
                .OrderBy(d => d)
                .Select(d => new SelectListItem { Value = d, Text = d })
                .ToList();

            ViewBag.TeamNamesList = await _context.EventQualifiers
                .Where(q => !string.IsNullOrEmpty(q.Team))
                .Select(q => q.Team)
                .Distinct()
                .OrderBy(s => s)
                .Select(s => new SelectListItem { Value = s, Text = s })
                .ToListAsync();

            // Populate DistrictsList for the dropdown
            ViewBag.DistrictsList = await _context.EventQualifiers
                .Where(q => !string.IsNullOrEmpty(q.Team))
                .Select(q => q.Team)
                .Distinct()
                .OrderBy(d => d)
                .Select(d => new SelectListItem { Value = d, Text = d })
                .ToListAsync();

            return View(sortedQualifiers);
        }

        [HttpGet]
        [Authorize(Roles = "Admin,Coordinator")]
        public async Task<IActionResult> EditQualifiers(List<string> sportsName, List<int> eventId, List<string> division, List<string> teamName)
        {
            var isAdmin = User.IsInRole("Admin");
            var hasCoordinatorId = int.TryParse(User.FindFirst("CoordinatorId")?.Value, out var coordinatorId);
            if (!isAdmin && !hasCoordinatorId) return Forbid();
            var joinedQuery = from q in _context.EventQualifiers.AsNoTracking()
                              join e in _context.Events.AsNoTracking() on q.EventId equals e.Id
                              where isAdmin || e.CoordinatorId == coordinatorId
                              select new { Qualifier = q, Event = new { e.Id, e.Division, e.SportName, e.Title } };

            if (sportsName != null && sportsName.Any())
            {
                joinedQuery = joinedQuery.Where(x => x.Event.SportName != null && sportsName.Contains(x.Event.SportName));
            }

            if (eventId != null && eventId.Any())
            {
                joinedQuery = joinedQuery.Where(x => eventId.Contains(x.Event.Id));
            }

            if (division != null && division.Any())
            {
                joinedQuery = joinedQuery.Where(x => division.Contains(x.Event.Division));
            }

            if (teamName == null || teamName.Count == 0)
                teamName = Request.Query["team"].Select(value => value ?? string.Empty).ToList();

            if (teamName != null && teamName.Any())
            {
                joinedQuery = joinedQuery.Where(x => x.Qualifier.Team != null && teamName.Contains(x.Qualifier.Team));
            }

            var rawList = await joinedQuery.ToListAsync();

            var sortedQualifiers = rawList
                .OrderBy(x => x.Event.Division ?? "")
                .ThenBy(x => x.Event.SportName ?? "")
                .ThenBy(x => x.Event.Title ?? "")
                .ThenBy(x => {
                    string r = x.Qualifier.Role?.ToLower() ?? "";
                    if (r.Contains("athlete")) return 1;
                    if (r.Contains("coach")) return 2;
                    if (r.Contains("chaperon") || r.Contains("chaperone")) return 3;
                    return 4;
                })
                .ThenBy(x => x.Qualifier.ParticipantName ?? "")
                .Select(x => x.Qualifier)
                .ToList();

            // Reuse the same read-only event and team data for every dropdown.
            var allEvents = await _context.Events.AsNoTracking()
                .Where(e => isAdmin || e.CoordinatorId == coordinatorId)
                .OrderBy(e => e.SportName).ThenBy(e => e.Title)
                .Select(e => new Event { Id = e.Id, Title = e.Title, SportName = e.SportName, Division = e.Division })
                .ToListAsync();
            var teams = await _context.Teams.AsNoTracking().OrderBy(t => t.Name).ToListAsync();
            ViewBag.SportsList = allEvents.Where(e => !string.IsNullOrEmpty(e.SportName))
                .Select(e => e.SportName).Distinct().OrderBy(s => s)
                .Select(s => new SelectListItem { Value = s, Text = s }).ToList();
            ViewBag.EventsList = allEvents.OrderBy(e => e.Title)
                .Select(e => new SelectListItem { Value = e.Id.ToString(), Text = e.Title }).ToList();
            ViewBag.DivisionsList = allEvents.Where(e => !string.IsNullOrEmpty(e.Division))
                .Select(e => e.Division).Union(new[] { "Elementary", "Secondary", "Paragames" })
                .OrderBy(d => d).Select(d => new SelectListItem { Value = d, Text = d }).ToList();
            ViewBag.TeamNamesList = await _context.EventQualifiers.AsNoTracking()
                .Where(q => !string.IsNullOrEmpty(q.Team)).Select(q => q.Team).Distinct().OrderBy(t => t)
                .Select(t => new SelectListItem { Value = t, Text = t }).ToListAsync();
            ViewBag.TeamsList = teams;
            ViewBag.AllEvents = allEvents;
            return View(sortedQualifiers);
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        [Authorize(Roles = "Admin,Coordinator")]
        public async Task<IActionResult> BulkSaveQualifiers(List<EventQualifier> qualifiers)
        {
            if (qualifiers != null && qualifiers.Any())
            {
                var ids = qualifiers.Select(q => q.Id).Distinct().ToList();
                var saved = await _context.EventQualifiers.Where(q => ids.Contains(q.Id)).ToListAsync();
                if (saved.Count != ids.Count) return NotFound();
                if (!await CanManageQualifierEvents(saved.Select(q => q.EventId).Concat(qualifiers.Select(q => q.EventId)))) return Forbid();
                foreach (var q in qualifiers)
                {
                    var existing = await _context.EventQualifiers.FindAsync(q.Id);
                    if (existing != null)
                    {
                        existing.EventId = q.EventId;
                        existing.ParticipantName = q.ParticipantName;
                        existing.Team = q.Team;
                        existing.Role = q.Role;
                        existing.TshirtSize = q.TshirtSize;
                        existing.UpdatedAt = DateTime.UtcNow;
                        _context.EventQualifiers.Update(existing);
                    }
                }
                await _context.SaveChangesAsync();
                TempData["SuccessMessage"] = "All qualifier updates saved successfully.";
            }
            return RedirectToAction(nameof(EditQualifiers));
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        [Authorize(Roles = "Admin,Coordinator")]
        public async Task<IActionResult> BulkDeleteQualifiers(List<Guid> selectedIds)
        {
            if (selectedIds != null && selectedIds.Any())
            {
                var itemsToRemove = await _context.EventQualifiers
                    .Where(q => selectedIds.Contains(q.Id))
                    .ToListAsync();

                if (!await CanManageQualifierEvents(itemsToRemove.Select(q => q.EventId))) return Forbid();
                if (itemsToRemove.Any())
                {
                    _context.EventQualifiers.RemoveRange(itemsToRemove);
                    await _context.SaveChangesAsync();
                    TempData["SuccessMessage"] = $"{itemsToRemove.Count} participant(s) deleted successfully.";
                }
            }
            else
            {
                TempData["ErrorMessage"] = "Please select at least one participant to delete.";
            }
            return RedirectToAction(nameof(EditQualifiers));
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        [Authorize(Roles = "Admin,Coordinator")]
        public async Task<IActionResult> SaveQualifierModal(EventQualifier model)
        {
            if (!await CanManageQualifierEvents(new[] { model.EventId })) return Forbid();
            EventQualifier? existing = null;
            if (model.Id != Guid.Empty)
            {
                existing = await _context.EventQualifiers.FindAsync(model.Id);
                if (existing == null) return NotFound();
                if (!await CanManageQualifierEvents(new[] { existing.EventId })) return Forbid();
            }
            if (ModelState.IsValid)
            {
                model.UpdatedAt = DateTime.UtcNow;
                if (model.Id == Guid.Empty)
                {
                    model.Id = Guid.NewGuid();
                    _context.EventQualifiers.Add(model);
                }
                else
                {
                    existing!.EventId = model.EventId;
                    existing.ParticipantName = model.ParticipantName;
                    existing.Team = model.Team;
                    existing.SpecificDistrict = model.SpecificDistrict;
                    existing.Role = model.Role;
                    existing.School = model.School;
                    existing.Gender = model.Gender;
                    existing.TshirtSize = model.TshirtSize;
                    existing.UpdatedAt = model.UpdatedAt;
                }
                await _context.SaveChangesAsync();
                TempData["SuccessMessage"] = "New participant successfully added.";
            }
            return RedirectToAction(nameof(EditQualifiers));
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        [Authorize(Roles = "Admin,Coordinator")]
        public async Task<IActionResult> DeleteQualifier(Guid id)
        {
            var qualifier = await _context.EventQualifiers.FindAsync(id);
            if (qualifier != null)
            {
                if (!await CanManageQualifierEvents(new[] { qualifier.EventId })) return Forbid();
                _context.EventQualifiers.Remove(qualifier);
                await _context.SaveChangesAsync();
                TempData["SuccessMessage"] = "Participant successfully deleted.";
            }
            return RedirectToAction(nameof(EditQualifiers));
        }
        private async Task<bool> CanManageQualifierEvents(IEnumerable<int> eventIds)
        {
            if (User.IsInRole("Admin")) return true;
            var ids = eventIds.Distinct().ToList();
            if (!int.TryParse(User.FindFirst("CoordinatorId")?.Value, out var coordinatorId)) return false;
            return await _context.Events.CountAsync(e => ids.Contains(e.Id) && e.CoordinatorId == coordinatorId) == ids.Count;
        }
    }
}
