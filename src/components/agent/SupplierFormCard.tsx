import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, Sparkles } from "lucide-react";

export function SupplierFormCard() {
  return (
    <div className="w-full max-w-xl">
      <div className="flex items-start gap-2 mb-4">
        <Sparkles className="h-5 w-5 text-amber-500 mt-0.5" />
        <div>
          <p className="font-medium">Looks like you are working with a new supplier.</p>
          <p className="text-muted-foreground">Please complete the details</p>
        </div>
      </div>
      
      <div className="bg-white dark:bg-card border rounded-xl p-5 shadow-sm">
        <h3 className="font-medium text-lg mb-4">Add new supplier</h3>
        
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="companyName">Company name</Label>
            <Input id="companyName" defaultValue="Ignite XP Agency LLC" />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="contactName">Contact name</Label>
              <Input id="contactName" defaultValue="Kai Nakamura" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" defaultValue="contact@vendor.example.com" />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="country">Country</Label>
              <Select defaultValue="us">
                <SelectTrigger>
                  <SelectValue placeholder="Choose country" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="us">United States</SelectItem>
                  <SelectItem value="uk">United Kingdom</SelectItem>
                  <SelectItem value="ca">Canada</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="language">Language</Label>
              <Select defaultValue="en">
                <SelectTrigger>
                  <SelectValue placeholder="Choose language" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="es">Spanish</SelectItem>
                  <SelectItem value="fr">French</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="pt-2">
            <button className="flex items-center text-sm font-medium text-muted-foreground hover:text-foreground">
              Additional details <ChevronDown className="h-4 w-4 ml-1" />
            </button>
          </div>
          
          <div className="flex justify-end pt-4 border-t mt-4">
            <Button className="bg-green-600 hover:bg-green-700 text-white rounded-md px-6">Save</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
