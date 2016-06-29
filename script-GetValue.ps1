<#
    .DESCRIPTION
THis gets the string which contains the keyvalue for a provided keyName. The keyValue and KeyName are stored 
in a microservice which is a keyvalue pair service.

    .NOTES
        AUTHOR: PK
        LASTEDIT: June 28, 2016
#>
workflow Get-KeyValue
{


    [OutputType([string])]
	
	
    param (

    [Parameter(Mandatory=$true)]
    [string] 
    $accountName,
    
    [Parameter(Mandatory=$true)]
    [string] 
    $variableName,
    
    [Parameter(Mandatory=$true)]
    [string] 
    $credentialName,
    
    [Parameter(Mandatory=$true)]
    [string] 
    $resourceGroupName

    [Parameter(Mandatory=$true)]
    [string] 
    $keyName

    [Parameter(Mandatory=$true)]
    [string] 
    $kmServerUrl
    
    
    )
    
    #The name of the Automation Credential Asset this runbook will use to authenticate to Azure.
    $CredentialAssetName = $credentialName

    #Get the credential with the above name from the Automation Asset store
    $Cred = Get-AutomationPSCredential -Name $CredentialAssetName
    if(!$Cred) {
        Throw "Could not find an Automation Credential Asset named '${CredentialAssetName}'. Make sure you have created one in this Automation Account."
    }

    #Connect to your Azure Account
    Add-AzureRmAccount -Credential $Cred
	
	

$Account1 = $accountName
$invokeUrl = $kmServerUrl +'/key/'+ $keyName
$response = Invoke-RestMethod -Uri $invokeUrl -Method Get -ContentType 'application/json'
	
    
	
	
	Write-Output "API has been invoked. Response is :"
  Write-Output $response


	
	Set-AzureRmAutomationVariable `
		-AutomationAccountName $Account1 `
		-Encrypted $False `
		-Name $variableName `
		-ResourceGroupName $resourceGroupName `
		-Value $response


	$KeyValueContent= Get-AzureRmAutomationVariable `
		-AutomationAccountName $Account1 `
		-Name $variableName `
		-ResourceGroupName $resourceGroupName
	
	Write-Output "KeyValueContent is "	

     Write-Output $KeyValueContent	

}