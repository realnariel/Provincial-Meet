using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ProvMeet.Data;
using ProvMeet.Models;
using ProvMeet.Security;
using System.Threading.Tasks;
using System.Linq;
using System;

namespace ProvMeet.Controllers
{
    [Authorize(Roles = "Admin")]
    public class CoordinatorsController : Controller
    {
        private readonly ApplicationDbContext _context;

        public CoordinatorsController(ApplicationDbContext context)
        {
            _context = context;
        }

        public async Task<IActionResult> Index()
        {
            var coordinators = await _context.Coordinators
                .OrderBy(c => c.FullName)
                .ToListAsync();
            return View(coordinators);
        }

        public IActionResult Create()
        {
            return View();
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Create([Bind("Username,Password,FullName,IsAdmin")] Coordinator coordinator)
        {
            if (ModelState.IsValid)
            {
                var exists = await _context.Coordinators
                    .AnyAsync(c => c.Username.ToLower() == coordinator.Username.ToLower());
                
                if (exists)
                {
                    ModelState.AddModelError("Username", "This username is already taken.");
                    return View(coordinator);
                }

                // Force the default password for new users
                coordinator.Password = CoordinatorPasswords.Hash("coordinator");

                _context.Add(coordinator);
                await _context.SaveChangesAsync();
                return RedirectToAction(nameof(Index));
            }
            return View(coordinator);
        }

        public async Task<IActionResult> Edit(int? id)
        {
            if (id == null) return NotFound();

            var coordinator = await _context.Coordinators.FindAsync(id);
            if (coordinator == null) return NotFound();

            // Never render stored credentials (legacy plaintext or hashes) in the form.
            coordinator.Password = string.Empty;
            return View(coordinator);
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Edit(int id, [Bind("Id,Username,Password,FullName,IsAdmin")] Coordinator coordinator)
        {
            if (id != coordinator.Id) return NotFound();

            if (string.IsNullOrEmpty(coordinator.Password)) ModelState.Remove(nameof(Coordinator.Password));
            if (ModelState.IsValid)
            {
                var usernameExists = await _context.Coordinators
                    .AnyAsync(c => c.Id != coordinator.Id && c.Username.ToLower() == coordinator.Username.ToLower());
                
                if (usernameExists)
                {
                    ModelState.AddModelError("Username", "This username is already taken by another user.");
                    return View(coordinator);
                }

                try
                {
                    var existing = await _context.Coordinators.FindAsync(id);
                    if (existing == null) return NotFound();
                    existing.Username = coordinator.Username;
                    existing.FullName = coordinator.FullName;
                    existing.IsAdmin = coordinator.IsAdmin;
                    if (!string.IsNullOrEmpty(coordinator.Password))
                        existing.Password = CoordinatorPasswords.Hash(coordinator.Password);
                    await _context.SaveChangesAsync();
                }
                catch (DbUpdateConcurrencyException)
                {
                    if (!CoordinatorExists(coordinator.Id)) return NotFound();
                    throw;
                }
                return RedirectToAction(nameof(Index));
            }
            return View(coordinator);
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Delete(int id)
        {
            var coordinator = await _context.Coordinators.FindAsync(id);
            if (coordinator != null)
            {
                _context.Coordinators.Remove(coordinator);
                await _context.SaveChangesAsync();
            }
            return RedirectToAction(nameof(Index));
        }

        private bool CoordinatorExists(int id)
        {
            return _context.Coordinators.Any(e => e.Id == id);
        }
    }
}
